import { z } from 'zod'
import { db, withUserScope, type Sql, type Tx } from '../db'
import { auditAs } from '../audit'
import { ServiceError } from '../errors'
import type { IdentityContext } from '../context'
import { optionalDate, optionalText, optionalUuid, parseInput, requireUuid, UUID_RE } from '../validation'
import { todayJakarta } from './search'

// ── Scope ───────────────────────────────────────────────────────────────
/** Division User hanya boleh melihat/mengelola notulensi & tindak lanjut divisinya sendiri. */
export const canViewDivision = (ctx: IdentityContext, divisionId: string) => ctx.roleId !== 'DIVISION_USER' || ctx.divisionId === divisionId
const canCreateInDivision = canViewDivision

async function deny(ctx: IdentityContext, action: string, resourceId: string | null, message = 'Akses ditolak. Anda tidak memiliki izin untuk tindakan ini.'): Promise<never> {
  await auditAs(ctx, { action, resourceType: 'MEETING_MINUTES', resourceId, result: 'DENIED' })
  throw new ServiceError('ACCESS_DENIED', message)
}

// ── Notulensi Rapat ────────────────────────────────────────────────────
export type MeetingStatus = 'DRAFT' | 'DISAHKAN'
export type MeetingType = 'INTERNAL' | 'EKSTERNAL'
export type ActionItemStatus = 'BELUM_MULAI' | 'BERJALAN' | 'SELESAI'

export interface MeetingMinutesDto {
  minutesId: string
  divisionId: string
  divisionName: string | null
  title: string
  meetingDate: string
  meetingType: MeetingType
  attendees: string[]
  summary: string
  driveUrl: string | null
  status: MeetingStatus
  picUserId: string | null
  picName: string | null
  createdByName: string | null
  actionItemCount: number
  openActionItemCount: number
  createdAt: Date
  updatedAt: Date
}

type MinutesRow = {
  minutes_id: string; division_id: string; division_name: string | null; title: string; meeting_date: string; meeting_type: MeetingType
  attendees: string[]; summary: string; drive_url: string | null; status: MeetingStatus; pic_user_id: string | null; pic_name: string | null
  created_by_name: string | null; action_item_count: number; open_action_item_count: number; created_at: Date; updated_at: Date
}

const toMinutesDto = (r: MinutesRow): MeetingMinutesDto => ({
  minutesId: r.minutes_id, divisionId: r.division_id, divisionName: r.division_name, title: r.title, meetingDate: r.meeting_date,
  meetingType: r.meeting_type, attendees: r.attendees ?? [], summary: r.summary, driveUrl: r.drive_url, status: r.status,
  picUserId: r.pic_user_id, picName: r.pic_name, createdByName: r.created_by_name,
  actionItemCount: r.action_item_count, openActionItemCount: r.open_action_item_count, createdAt: r.created_at, updatedAt: r.updated_at,
})

const minutesSelect = (q: Sql | Tx) => q`
  select m.*, v.division_name, p.name as pic_name, cb.name as created_by_name,
    (select count(*)::int from meeting_action_items a where a.minutes_id = m.minutes_id) as action_item_count,
    (select count(*)::int from meeting_action_items a where a.minutes_id = m.minutes_id and a.status <> 'SELESAI') as open_action_item_count
  from meeting_minutes m
  left join divisions v on v.division_id = m.division_id
  left join users p on p.user_id = m.pic_user_id
  left join users cb on cb.user_id = m.created_by`

const attendeesField = z
  .string()
  .nullish()
  .transform((v) => (v ?? '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 25))

const MeetingMinutesInput = z.object({
  divisionId: z.string().regex(UUID_RE, 'divisi tidak valid'),
  title: z.string().trim().min(3, 'minimal 3 karakter').max(200),
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'format tanggal YYYY-MM-DD'),
  meetingType: z.enum(['INTERNAL', 'EKSTERNAL']).default('INTERNAL'),
  attendees: attendeesField,
  summary: z.string().trim().min(3, 'minimal 3 karakter').max(4000),
  driveUrl: optionalText,
  status: z.enum(['DRAFT', 'DISAHKAN']).default('DISAHKAN'),
  picUserId: optionalUuid,
})

export async function createMeetingMinutes(ctx: IdentityContext, input: unknown): Promise<MeetingMinutesDto> {
  const data = parseInput(MeetingMinutesInput, input)
  if (!canCreateInDivision(ctx, data.divisionId)) return deny(ctx, 'MEETING_MINUTES_CREATED', null, 'Anda hanya dapat membuat notulensi untuk divisi Anda sendiri.')
  if (data.driveUrl && !/^https?:\/\//.test(data.driveUrl)) throw new ServiceError('VALIDATION', 'driveUrl: harus berupa tautan http(s) yang valid')
  if (data.divisionId && !(await db()`select 1 from divisions where division_id = ${data.divisionId}`).length)
    throw new ServiceError('VALIDATION', 'divisionId: divisi tidak ditemukan')
  const id = await db().begin(async (tx) => {
    const [row] = await tx<{ minutes_id: string }[]>`
      insert into meeting_minutes (division_id, title, meeting_date, meeting_type, attendees, summary, drive_url, status, pic_user_id, created_by)
      values (${data.divisionId}, ${data.title}, ${data.meetingDate}, ${data.meetingType}, ${data.attendees}, ${data.summary}, ${data.driveUrl}, ${data.status}, ${data.picUserId}, ${ctx.userId})
      returning minutes_id`
    await auditAs(ctx, { action: 'MEETING_MINUTES_CREATED', resourceType: 'MEETING_MINUTES', resourceId: row.minutes_id, result: 'SUCCESS', metadata: { title: data.title, divisionId: data.divisionId } }, tx)
    return row.minutes_id
  })
  return (await getMeetingMinutesDto(ctx, id))!
}

async function getMeetingMinutesDto(ctx: IdentityContext, id: string): Promise<MeetingMinutesDto | null> {
  const [row] = await db()<MinutesRow[]>`${minutesSelect(db())} where m.minutes_id = ${id}`
  if (!row) return null
  if (!canViewDivision(ctx, row.division_id)) return null
  return toMinutesDto(row)
}

export interface ListMeetingsOptions {
  divisionId?: string
  limit?: number
}

export async function listMeetings(ctx: IdentityContext, opts: ListMeetingsOptions = {}): Promise<MeetingMinutesDto[]> {
  return withUserScope(ctx.userId, async (q) => {
    const rows = await q<MinutesRow[]>`
      ${minutesSelect(q)}
      where ${opts.divisionId ? q`m.division_id = ${opts.divisionId}` : q`true`}
      order by m.meeting_date desc, m.created_at desc
      limit ${opts.limit ?? 100}`
    return rows.map(toMinutesDto)
  })
}

export async function getMeetingDetail(ctx: IdentityContext, minutesId: unknown): Promise<{ meeting: MeetingMinutesDto; actionItems: ActionItemDto[]; canManage: boolean }> {
  const id = requireUuid(minutesId, 'Notulensi')
  const [row] = await db()<MinutesRow[]>`${minutesSelect(db())} where m.minutes_id = ${id}`
  if (!row) throw new ServiceError('NOT_FOUND', 'Notulensi tidak ditemukan.')
  if (!canViewDivision(ctx, row.division_id)) {
    await auditAs(ctx, { action: 'ACCESS_DENIED', resourceType: 'MEETING_MINUTES', resourceId: id, result: 'DENIED', metadata: { attempted: 'MEETING_MINUTES_VIEWED' } })
    throw new ServiceError('ACCESS_DENIED', 'Akses ditolak. Notulensi ini bukan milik divisi Anda.')
  }
  const items = await listActionItems(ctx, { minutesId: id })
  return { meeting: toMinutesDto(row), actionItems: items, canManage: canCreateInDivision(ctx, row.division_id) }
}

// ── Tindak Lanjut (Action Items / To-Do) ──────────────────────────────
export interface ActionItemDto {
  actionItemId: string
  minutesId: string | null
  minutesTitle: string | null
  divisionId: string
  divisionName: string | null
  description: string
  picUserId: string | null
  picName: string | null
  dueDate: string | null
  status: ActionItemStatus
  completedAt: Date | null
  createdAt: Date
}

type ActionItemRow = {
  action_item_id: string; minutes_id: string | null; minutes_title: string | null; division_id: string; division_name: string | null
  description: string; pic_user_id: string | null; pic_name: string | null; due_date: string | null; status: ActionItemStatus
  completed_at: Date | null; created_at: Date
}
const toActionItemDto = (r: ActionItemRow): ActionItemDto => ({
  actionItemId: r.action_item_id, minutesId: r.minutes_id, minutesTitle: r.minutes_title, divisionId: r.division_id, divisionName: r.division_name,
  description: r.description, picUserId: r.pic_user_id, picName: r.pic_name, dueDate: r.due_date, status: r.status,
  completedAt: r.completed_at, createdAt: r.created_at,
})
const actionItemSelect = (q: Sql | Tx) => q`
  select a.*, m.title as minutes_title, v.division_name, p.name as pic_name
  from meeting_action_items a
  left join meeting_minutes m on m.minutes_id = a.minutes_id
  left join divisions v on v.division_id = a.division_id
  left join users p on p.user_id = a.pic_user_id`

export interface ListActionItemsOptions {
  minutesId?: string
  divisionId?: string
  status?: ActionItemStatus | 'OPEN'
  scope?: 'all' | 'mine'
  limit?: number
}

export async function listActionItems(ctx: IdentityContext, opts: ListActionItemsOptions = {}): Promise<ActionItemDto[]> {
  return withUserScope(ctx.userId, async (q) => {
    const rows = await q<ActionItemRow[]>`
      ${actionItemSelect(q)}
      where ${opts.minutesId ? q`a.minutes_id = ${opts.minutesId}` : q`true`}
        and ${opts.divisionId ? q`a.division_id = ${opts.divisionId}` : q`true`}
        and ${opts.status === 'OPEN' ? q`a.status <> 'SELESAI'` : opts.status ? q`a.status = ${opts.status}` : q`true`}
        and ${opts.scope === 'mine' ? q`a.pic_user_id = ${ctx.userId}` : q`true`}
      order by (a.status = 'SELESAI'), a.due_date nulls last, a.created_at desc
      limit ${opts.limit ?? 200}`
    return rows.map(toActionItemDto)
  })
}

const ActionItemInput = z.object({
  minutesId: optionalUuid,
  divisionId: optionalUuid,
  description: z.string().trim().min(3, 'minimal 3 karakter').max(500),
  picUserId: optionalUuid,
  dueDate: optionalDate,
  status: z.enum(['BELUM_MULAI', 'BERJALAN', 'SELESAI']).default('BELUM_MULAI'),
})

export async function createActionItem(ctx: IdentityContext, input: unknown): Promise<ActionItemDto> {
  const data = parseInput(ActionItemInput, input)
  let divisionId = data.divisionId
  if (data.minutesId) {
    const [m] = await db()<{ division_id: string }[]>`select division_id from meeting_minutes where minutes_id = ${data.minutesId}`
    if (!m) throw new ServiceError('NOT_FOUND', 'Notulensi tidak ditemukan.')
    divisionId = m.division_id
  }
  if (!divisionId) throw new ServiceError('VALIDATION', 'divisionId: wajib diisi (atau pilih notulensi rapat)')
  if (!canCreateInDivision(ctx, divisionId)) return deny(ctx, 'ACTION_ITEM_CREATED', null, 'Anda hanya dapat menambah tindak lanjut untuk divisi Anda sendiri.')
  const id = await db().begin(async (tx) => {
    const [row] = await tx<{ action_item_id: string }[]>`
      insert into meeting_action_items (minutes_id, division_id, description, pic_user_id, due_date, status, created_by)
      values (${data.minutesId}, ${divisionId}, ${data.description}, ${data.picUserId}, ${data.dueDate}, ${data.status}, ${ctx.userId})
      returning action_item_id`
    await auditAs(ctx, { action: 'ACTION_ITEM_CREATED', resourceType: 'ACTION_ITEM', resourceId: row.action_item_id, result: 'SUCCESS', metadata: { divisionId, minutesId: data.minutesId ?? null } }, tx)
    return row.action_item_id
  })
  const [row] = await db()<ActionItemRow[]>`${actionItemSelect(db())} where a.action_item_id = ${id}`
  return toActionItemDto(row)
}

const StatusInput = z.object({ status: z.enum(['BELUM_MULAI', 'BERJALAN', 'SELESAI']) })

export async function updateActionItemStatus(ctx: IdentityContext, actionItemId: unknown, input: unknown): Promise<ActionItemDto> {
  const id = requireUuid(actionItemId, 'Tindak lanjut')
  const data = parseInput(StatusInput, input)
  const [row] = await db()<{ division_id: string; status: ActionItemStatus }[]>`select division_id, status from meeting_action_items where action_item_id = ${id}`
  if (!row) throw new ServiceError('NOT_FOUND', 'Tindak lanjut tidak ditemukan.')
  if (!canViewDivision(ctx, row.division_id)) return deny(ctx, 'ACTION_ITEM_STATUS_CHANGED', id, 'Akses ditolak untuk tindak lanjut divisi lain.')
  await db().begin(async (tx) => {
    await tx`update meeting_action_items set status = ${data.status}, completed_at = ${data.status === 'SELESAI' ? tx`now()` : null}, updated_at = now() where action_item_id = ${id}`
    await auditAs(ctx, { action: 'ACTION_ITEM_STATUS_CHANGED', resourceType: 'ACTION_ITEM', resourceId: id, result: 'SUCCESS', metadata: { from: row.status, to: data.status } }, tx)
  })
  const [after] = await db()<ActionItemRow[]>`${actionItemSelect(db())} where a.action_item_id = ${id}`
  return toActionItemDto(after)
}

// ── Statistik (kartu ringkasan halaman & Command Center) ──────────────
export interface MeetingStats {
  activeActionItems: number
  dueThisWeek: number
  minutesThisMonth: number
  complianceRate: number
}

export async function getMeetingStats(ctx: IdentityContext): Promise<MeetingStats> {
  const today = todayJakarta()
  return withUserScope(ctx.userId, async (q) => {
    const scope = ctx.roleId === 'DIVISION_USER' ? q`a.division_id = ${ctx.divisionId}` : q`true`
    const scopeM = ctx.roleId === 'DIVISION_USER' ? q`m.division_id = ${ctx.divisionId}` : q`true`
    const [active] = await q<{ n: number; due_week: number }[]>`
      select count(*)::int as n, count(*) filter (where due_date is not null and due_date between ${today}::date and ${today}::date + 7)::int as due_week
      from meeting_action_items a where a.status <> 'SELESAI' and ${scope}`
    const [compliance] = await q<{ done: number; total: number }[]>`
      select count(*) filter (where status = 'SELESAI')::int as done, count(*)::int as total
      from meeting_action_items a where due_date is not null and due_date <= ${today}::date and ${scope}`
    const [month] = await q<{ n: number }[]>`
      select count(*)::int as n from meeting_minutes m
      where date_trunc('month', meeting_date) = date_trunc('month', ${today}::date) and ${scopeM}`
    return {
      activeActionItems: active.n,
      dueThisWeek: active.due_week,
      minutesThisMonth: month.n,
      complianceRate: compliance.total === 0 ? 100 : Math.round((compliance.done / compliance.total) * 100),
    }
  })
}

export async function myActionItems(ctx: IdentityContext, limit = 8): Promise<ActionItemDto[]> {
  return listActionItems(ctx, { scope: 'mine', status: 'OPEN', limit })
}
