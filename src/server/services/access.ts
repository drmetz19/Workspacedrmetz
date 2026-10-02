import { z } from 'zod'
import { db } from '../db'
import { auditAs, recordAudit } from '../audit'
import { config } from '../config'
import { ServiceError } from '../errors'
import type { IdentityContext } from '../context'
import { optionalText, parseInput, requireUuid } from '../validation'
import { approverFor, decide } from '../permissions/engine'
import { sendEmail } from '../integrations/email'
import { facts, loadVisibleDocumentWithGrants, type DocumentRow } from './documents'

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED'

export interface AccessRequestDto {
  requestId: string
  documentId: string
  documentName: string
  securityLevel: number
  categoryName: string | null
  divisionName: string | null
  requesterUserId: string
  requesterName: string
  requesterEmail: string
  requestedAction: 'OPEN' | 'EDIT_METADATA'
  reason: string
  approverRole: 'GM' | 'OWNER'
  status: RequestStatus
  autoCreated: boolean
  durationDays: number | null
  decidedByName: string | null
  decidedAt: Date | null
  decisionNote: string | null
  expiresAt: Date | null
  createdAt: Date
}

type Row = {
  request_id: string; document_id: string; document_name: string; security_level: number; category_name: string | null; division_name: string | null
  requester_user_id: string; requester_name: string; requester_email: string; requested_action: 'OPEN' | 'EDIT_METADATA'; reason: string
  approver_role: 'GM' | 'OWNER'; status: RequestStatus; auto_created: boolean; duration_days: number | null; decided_by_name: string | null
  decided_at: Date | null; decision_note: string | null; expires_at: Date | null; created_at: Date
}

const toDto = (r: Row): AccessRequestDto => ({
  requestId: r.request_id, documentId: r.document_id, documentName: r.document_name, securityLevel: r.security_level,
  categoryName: r.category_name, divisionName: r.division_name, requesterUserId: r.requester_user_id, requesterName: r.requester_name,
  requesterEmail: r.requester_email, requestedAction: r.requested_action, reason: r.reason, approverRole: r.approver_role, status: r.status,
  autoCreated: r.auto_created, durationDays: r.duration_days, decidedByName: r.decided_by_name, decidedAt: r.decided_at,
  decisionNote: r.decision_note, expiresAt: r.expires_at, createdAt: r.created_at,
})

const baseSelect = () => db()`
  select r.*, d.document_name, d.security_level, c.category_name, v.division_name,
    u.name as requester_name, u.email as requester_email, dec.name as decided_by_name
  from access_requests r
  join documents d on d.document_id = r.document_id
  left join categories c on c.category_id = d.category_id
  left join divisions v on v.division_id = d.division_id
  join users u on u.user_id = r.requester_user_id
  left join users dec on dec.user_id = r.decided_by`

async function loadRequest(id: string) {
  const [r] = await db()<Row[]>`${baseSelect()} where r.request_id = ${id}`
  return r ?? null
}

/** Siapa yang berwenang memutuskan: OWNER selalu; GM hanya untuk request ber-approver GM. Tidak boleh memutuskan permintaan sendiri. */
function canDecide(ctx: IdentityContext, r: Pick<Row, 'approver_role' | 'requester_user_id'>) {
  if (r.requester_user_id === ctx.userId) return false
  return ctx.roleId === 'OWNER' || (ctx.roleId === 'GM' && r.approver_role === 'GM')
}

async function notifyApprovers(role: 'GM' | 'OWNER', subject: string, body: string) {
  const roles = role === 'GM' ? ['GM', 'OWNER'] : ['OWNER']
  const users = await db()<{ email: string }[]>`select email from users where role_id = any(${roles}) and status = 'ACTIVE'`
  for (const u of users) await sendEmail({ to: u.email, subject, body })
}

// ── request_document_access ─────────────────────────────────────────────
const RequestInput = z.object({
  reason: z.string().trim().min(5, 'jelaskan alasan (minimal 5 karakter)').max(1000),
  requestedAction: z.enum(['OPEN', 'EDIT_METADATA']).default('OPEN'),
})

export async function requestDocumentAccess(ctx: IdentityContext, documentId: unknown, input: unknown, opts: { auto?: boolean } = {}): Promise<AccessRequestDto> {
  const data = parseInput(RequestInput, input)
  const { row, grants } = await loadVisibleDocumentWithGrants(ctx, documentId, 'APPROVAL_REQUESTED')
  if (row.status !== 'ACTIVE') throw new ServiceError('VALIDATION', 'Permintaan akses hanya untuk dokumen aktif.')
  const dec = decide(ctx, facts(row), data.requestedAction, grants)
  if (dec.allowed) throw new ServiceError('VALIDATION', 'Anda sudah memiliki akses ke dokumen ini.')
  if (!dec.requestable) throw new ServiceError('ACCESS_DENIED', 'Dokumen ini tidak dapat diminta aksesnya.')
  const approver = approverFor(facts(row))
  const [pending] = await db()<{ request_id: string }[]>`
    select request_id from access_requests where document_id = ${row.document_id} and requester_user_id = ${ctx.userId}
      and requested_action = ${data.requestedAction} and status = 'PENDING'`
  if (pending) {
    if (opts.auto) return toDto((await loadRequest(pending.request_id))!)
    throw new ServiceError('CONFLICT', 'Anda sudah memiliki permintaan yang menunggu keputusan untuk dokumen ini.')
  }
  const id = await db().begin(async (tx) => {
    const [r] = await tx<{ request_id: string }[]>`
      insert into access_requests (document_id, requester_user_id, requested_action, reason, approver_role, auto_created)
      values (${row.document_id}, ${ctx.userId}, ${data.requestedAction}, ${data.reason}, ${approver}, ${opts.auto ?? false})
      returning request_id`
    await auditAs(ctx, {
      action: 'APPROVAL_REQUESTED', resourceType: 'DOCUMENT', resourceId: row.document_id, result: 'SUCCESS',
      metadata: { requestId: r.request_id, approverRole: approver, requestedAction: data.requestedAction, auto: opts.auto ?? false },
    }, tx)
    return r.request_id
  })
  await notifyApprovers(approver, `Permintaan akses: ${row.document_name}`,
    `${ctx.name} meminta akses ${data.requestedAction === 'OPEN' ? 'membuka' : 'mengubah metadata'} dokumen "${row.document_name}" (L${row.security_level}).\nAlasan: ${data.reason}\n\nPutuskan di ${config.appUrl}/access`)
  return toDto((await loadRequest(id))!)
}

/** Dipanggil saat GM mencoba aksi pada dokumen wajib persetujuan Owner (Scenario 3). */
export async function autoRequestOwnerApproval(ctx: IdentityContext, row: DocumentRow, action: 'OPEN' | 'EDIT_METADATA') {
  return requestDocumentAccess(ctx, row.document_id, {
    requestedAction: action,
    reason: `Otomatis: ${ctx.name} mencoba ${action === 'OPEN' ? 'membuka' : 'mengubah'} dokumen yang wajib persetujuan Owner.`,
  }, { auto: true })
}

// ── list_pending_approvals ──────────────────────────────────────────────
export async function listPendingApprovals(ctx: IdentityContext): Promise<AccessRequestDto[]> {
  if (ctx.roleId === 'DIVISION_USER') return []
  const rows = await db()<Row[]>`${baseSelect()}
    where r.status = 'PENDING' and r.requester_user_id <> ${ctx.userId}
      and ${ctx.roleId === 'OWNER' ? db()`true` : db()`r.approver_role = 'GM'`}
    order by r.created_at`
  return rows.map(toDto)
}

export async function listMyRequests(ctx: IdentityContext): Promise<AccessRequestDto[]> {
  const rows = await db()<Row[]>`${baseSelect()} where r.requester_user_id = ${ctx.userId} order by r.created_at desc limit 200`
  return rows.map(toDto)
}

export async function listDecidedRequests(ctx: IdentityContext): Promise<AccessRequestDto[]> {
  if (ctx.roleId === 'DIVISION_USER') return []
  const rows = await db()<Row[]>`${baseSelect()}
    where r.status <> 'PENDING' and ${ctx.roleId === 'OWNER' ? db()`true` : db()`r.approver_role = 'GM'`}
    order by coalesce(r.decided_at, r.created_at) desc limit 200`
  return rows.map(toDto)
}

// ── approve / reject ────────────────────────────────────────────────────
const ApproveInput = z.object({
  durationDays: z.coerce.number().refine((v) => [1, 7, 30].includes(v), 'pilih 1, 7, atau 30 hari'),
  note: optionalText,
})

async function loadForDecision(ctx: IdentityContext, requestId: unknown, action: string) {
  const id = requireUuid(requestId, 'Permintaan')
  const r = await loadRequest(id)
  if (!r) throw new ServiceError('NOT_FOUND', 'Permintaan tidak ditemukan.')
  if (!canDecide(ctx, r)) {
    await auditAs(ctx, { action, resourceType: 'DOCUMENT', resourceId: r.document_id, result: 'DENIED', metadata: { requestId: id } })
    throw new ServiceError('ACCESS_DENIED', r.requester_user_id === ctx.userId ? 'Anda tidak dapat memutuskan permintaan Anda sendiri.' : `Permintaan ini hanya dapat diputuskan oleh ${r.approver_role === 'OWNER' ? 'Owner' : 'GM atau Owner'}.`)
  }
  if (r.status !== 'PENDING') throw new ServiceError('CONFLICT', 'Permintaan ini sudah diputuskan.')
  return r
}

export async function approveAccessRequest(ctx: IdentityContext, requestId: unknown, input: unknown): Promise<AccessRequestDto> {
  const r = await loadForDecision(ctx, requestId, 'ACCESS_APPROVED')
  const data = parseInput(ApproveInput, input)
  const expiresAt = new Date(Date.now() + data.durationDays * 86_400_000)
  await db().begin(async (tx) => {
    const [p] = await tx<{ permission_id: string }[]>`
      insert into permissions (resource_type, resource_id, principal_type, principal_id, permission_type, granted_by, reason, source, expires_at)
      values ('DOCUMENT', ${r.document_id}, 'USER', ${r.requester_user_id}, ${r.requested_action}, ${ctx.userId}, ${r.reason}, 'ACCESS_REQUEST', ${expiresAt})
      returning permission_id`
    const upd = await tx`update access_requests set status = 'APPROVED', decided_by = ${ctx.userId}, decided_at = now(), decision_note = ${data.note},
      duration_days = ${data.durationDays}, permission_id = ${p.permission_id}, expires_at = ${expiresAt}
      where request_id = ${r.request_id} and status = 'PENDING' returning 1`
    if (!upd.length) throw new ServiceError('CONFLICT', 'Permintaan ini sudah diputuskan.')
    await auditAs(ctx, {
      action: 'ACCESS_APPROVED', resourceType: 'DOCUMENT', resourceId: r.document_id, result: 'SUCCESS',
      metadata: { requestId: r.request_id, requester: r.requester_email, durationDays: data.durationDays, expiresAt, permissionId: p.permission_id },
    }, tx)
  })
  await sendEmail({ to: r.requester_email, subject: `Akses disetujui: ${r.document_name}`,
    body: `Permintaan akses Anda untuk "${r.document_name}" disetujui oleh ${ctx.name} sampai ${expiresAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}.\nBuka di ${config.appUrl}/documents/${r.document_id}` })
  return toDto((await loadRequest(r.request_id))!)
}

const RejectInput = z.object({ note: z.string().trim().min(3, 'isi alasan penolakan').max(1000) })

export async function rejectAccessRequest(ctx: IdentityContext, requestId: unknown, input: unknown): Promise<AccessRequestDto> {
  const r = await loadForDecision(ctx, requestId, 'ACCESS_REJECTED')
  const data = parseInput(RejectInput, input)
  await db().begin(async (tx) => {
    await tx`update access_requests set status = 'REJECTED', decided_by = ${ctx.userId}, decided_at = now(), decision_note = ${data.note}
             where request_id = ${r.request_id}`
    await auditAs(ctx, { action: 'ACCESS_REJECTED', resourceType: 'DOCUMENT', resourceId: r.document_id, result: 'SUCCESS', metadata: { requestId: r.request_id, requester: r.requester_email, note: data.note } }, tx)
  })
  await sendEmail({ to: r.requester_email, subject: `Akses ditolak: ${r.document_name}`, body: `Permintaan akses Anda untuk "${r.document_name}" ditolak oleh ${ctx.name}.\nAlasan: ${data.note}` })
  return toDto((await loadRequest(r.request_id))!)
}

export async function cancelAccessRequest(ctx: IdentityContext, requestId: unknown) {
  const id = requireUuid(requestId, 'Permintaan')
  const rows = await db()<{ document_id: string }[]>`update access_requests set status = 'CANCELLED', decided_at = now()
    where request_id = ${id} and requester_user_id = ${ctx.userId} and status = 'PENDING' returning document_id`
  if (!rows.length) throw new ServiceError('NOT_FOUND', 'Permintaan tidak ditemukan atau sudah diputuskan.')
  await auditAs(ctx, { action: 'APPROVAL_CANCELLED', resourceType: 'DOCUMENT', resourceId: rows[0].document_id, result: 'SUCCESS', metadata: { requestId: id } })
}

// ── Kedaluwarsa otomatis (cron) ─────────────────────────────────────────
export async function expireAccessGrants(now = new Date()) {
  const rows = await db()<{ request_id: string; document_id: string; permission_id: string | null; requester_user_id: string }[]>`
    update access_requests set status = 'EXPIRED' where status = 'APPROVED' and expires_at <= ${now}
    returning request_id, document_id, permission_id, requester_user_id`
  for (const r of rows) {
    if (r.permission_id) await db()`update permissions set revoked_at = ${now} where permission_id = ${r.permission_id} and revoked_at is null`
    await recordAudit({ actorUserId: null, action: 'ACCESS_EXPIRED', resourceType: 'DOCUMENT', resourceId: r.document_id, result: 'SUCCESS', source: 'SYSTEM', metadata: { requestId: r.request_id, userId: r.requester_user_id } })
  }
  return { expired: rows.length }
}
