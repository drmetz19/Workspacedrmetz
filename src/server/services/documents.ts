import { z } from 'zod'
import { db, type Sql, type Tx } from '../db'
import { auditAs } from '../audit'
import { ServiceError } from '../errors'
import type { IdentityContext } from '../context'
import { optionalDate, optionalText, optionalUuid, parseInput, requireUuid } from '../validation'
import { parseDriveFileId } from '../integrations/drive/url'
import { canArchive, canCreateIn, canEditMetadata, canView, type DocFacts } from '../permissions/engine'
import { visibleDocumentsWhere } from '../permissions/sql'

// ── Tipe ────────────────────────────────────────────────────────────────
export type DocumentStatus = 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'ARCHIVED'

export interface DocumentRow {
  document_id: string
  external_provider: string
  external_resource_id: string | null
  external_url: string | null
  document_name: string
  document_number: string | null
  category_id: string | null
  division_id: string | null
  security_level: number
  owner_user_id: string | null
  pic_user_id: string | null
  status: DocumentStatus
  version: number
  supersedes_document_id: string | null
  effective_date: string | null
  expiry_date: string | null
  confirmed_summary: string | null
  owner_approval_required: boolean
  source_id: string | null
  flag_source_missing: boolean
  flag_content_unreadable: boolean
  created_by: string | null
  created_at: Date
  updated_at: Date
  // join
  category_name?: string | null
  division_name?: string | null
  pic_name?: string | null
  pic_email?: string | null
  owner_name?: string | null
}

export interface DocumentDto {
  documentId: string
  documentName: string
  documentNumber: string | null
  categoryId: string | null
  categoryName: string | null
  divisionId: string | null
  divisionName: string | null
  securityLevel: number
  ownerUserId: string | null
  ownerName: string | null
  picUserId: string | null
  picName: string | null
  status: DocumentStatus
  version: number
  supersedesDocumentId: string | null
  effectiveDate: string | null
  expiryDate: string | null
  externalProvider: string
  externalResourceId: string | null
  /** Hanya terisi untuk level yang boleh dibuka langsung di Drive (L1–2) atau Owner — lihat Phase 4. */
  externalUrl: string | null
  confirmedSummary: string | null
  ownerApprovalRequired: boolean
  sourceId: string | null
  flags: { sourceMissing: boolean; contentUnreadable: boolean }
  createdAt: Date
  updatedAt: Date
}

export interface DocumentRef {
  documentId: string
  documentName: string
  version: number
  status: DocumentStatus
}

export interface DocumentDetail extends DocumentDto {
  supersedes: DocumentRef | null
  supersededBy: DocumentRef | null
  permissions: { canEdit: boolean; canArchive: boolean }
}

export const facts = (r: DocumentRow): DocFacts => ({
  documentId: r.document_id,
  securityLevel: r.security_level,
  divisionId: r.division_id,
  picUserId: r.pic_user_id,
  ownerApprovalRequired: r.owner_approval_required,
  status: r.status,
})

export function toDocumentDto(r: DocumentRow, opts: { exposeUrl?: boolean } = {}): DocumentDto {
  return {
    documentId: r.document_id,
    documentName: r.document_name,
    documentNumber: r.document_number,
    categoryId: r.category_id,
    categoryName: r.category_name ?? null,
    divisionId: r.division_id,
    divisionName: r.division_name ?? null,
    securityLevel: r.security_level,
    ownerUserId: r.owner_user_id,
    ownerName: r.owner_name ?? null,
    picUserId: r.pic_user_id,
    picName: r.pic_name ?? null,
    status: r.status,
    version: r.version,
    supersedesDocumentId: r.supersedes_document_id,
    effectiveDate: r.effective_date,
    expiryDate: r.expiry_date,
    externalProvider: r.external_provider,
    externalResourceId: r.external_resource_id,
    externalUrl: opts.exposeUrl === false ? null : r.external_url,
    confirmedSummary: r.confirmed_summary,
    ownerApprovalRequired: r.owner_approval_required,
    sourceId: r.source_id,
    flags: { sourceMissing: r.flag_source_missing, contentUnreadable: r.flag_content_unreadable },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** SELECT dokumen + nama-nama join. */
export const documentSelect = (q: Sql | Tx) => q`
  select d.*, c.category_name, v.division_name, p.name as pic_name, p.email as pic_email, o.name as owner_name
  from documents d
  left join categories c on c.category_id = d.category_id
  left join divisions v on v.division_id = d.division_id
  left join users p on p.user_id = d.pic_user_id
  left join users o on o.user_id = d.owner_user_id`

export async function loadDocumentRow(q: Sql | Tx, id: string): Promise<DocumentRow | null> {
  const [row] = await q<DocumentRow[]>`${documentSelect(q)} where d.document_id = ${id}`
  return row ?? null
}

/** Memuat dokumen + memastikan user boleh melihatnya. Penolakan diaudit (ACCESS_DENIED). */
export async function loadVisibleDocument(ctx: IdentityContext, documentId: unknown, attemptedAction = 'DOCUMENT_VIEWED') {
  const id = requireUuid(documentId, 'Dokumen')
  const row = await loadDocumentRow(db(), id)
  if (!row) throw new ServiceError('NOT_FOUND', 'Dokumen tidak ditemukan.')
  if (!canView(ctx, facts(row))) {
    await auditAs(ctx, { action: 'ACCESS_DENIED', resourceType: 'DOCUMENT', resourceId: id, result: 'DENIED', metadata: { attempted: attemptedAction } })
    throw new ServiceError('ACCESS_DENIED', 'Akses ditolak. Anda tidak memiliki izin untuk dokumen ini.')
  }
  return row
}

async function deny(ctx: IdentityContext, id: string, attempted: string, message = 'Akses ditolak. Anda tidak memiliki izin untuk tindakan ini.'): Promise<never> {
  await auditAs(ctx, { action: 'ACCESS_DENIED', resourceType: 'DOCUMENT', resourceId: id, result: 'DENIED', metadata: { attempted } })
  throw new ServiceError('ACCESS_DENIED', message)
}

// ── Input ───────────────────────────────────────────────────────────────
const DocumentInput = z
  .object({
    documentName: z.string().trim().min(3, 'minimal 3 karakter').max(200),
    documentNumber: optionalText,
    categoryId: optionalUuid,
    divisionId: optionalUuid,
    securityLevel: z.coerce.number().int().min(1).max(5).default(2),
    picUserId: optionalUuid,
    externalUrl: optionalText,
    effectiveDate: optionalDate,
    expiryDate: optionalDate,
    confirmedSummary: optionalText,
    supersedesDocumentId: optionalUuid,
  })
  .refine((v) => !v.expiryDate || !v.effectiveDate || v.expiryDate >= v.effectiveDate, {
    message: 'tanggal kedaluwarsa harus sama atau setelah tanggal berlaku',
    path: ['expiryDate'],
  })

type ParsedInput = z.infer<typeof DocumentInput>

function resolveExternal(data: ParsedInput) {
  if (!data.externalUrl) return { externalUrl: null, externalResourceId: null }
  const id = parseDriveFileId(data.externalUrl)
  if (!id) throw new ServiceError('VALIDATION', 'externalUrl: bukan tautan/ID Google Drive yang dikenali')
  const isUrl = /^https:\/\//.test(data.externalUrl)
  return { externalUrl: isUrl ? data.externalUrl : `https://drive.google.com/file/d/${id}/view`, externalResourceId: id }
}

async function assertRefs(q: Sql | Tx, data: ParsedInput) {
  if (data.categoryId && !(await q`select 1 from categories where category_id = ${data.categoryId}`).length)
    throw new ServiceError('VALIDATION', 'categoryId: kategori tidak ditemukan')
  if (data.divisionId && !(await q`select 1 from divisions where division_id = ${data.divisionId}`).length)
    throw new ServiceError('VALIDATION', 'divisionId: divisi tidak ditemukan')
  if (data.picUserId && !(await q`select 1 from users where user_id = ${data.picUserId} and status <> 'DEACTIVATED'`).length)
    throw new ServiceError('VALIDATION', 'picUserId: user tidak ditemukan')
}

async function duplicateMessage(q: Sql | Tx, externalResourceId: string) {
  const [dup] = await q<{ document_name: string }[]>`select document_name from documents where external_provider = 'GOOGLE_DRIVE' and external_resource_id = ${externalResourceId}`
  return dup ? `File Drive ini sudah terdaftar sebagai "${dup.document_name}".` : null
}

// ── create_document_record ──────────────────────────────────────────────
export async function createDocumentRecord(ctx: IdentityContext, input: unknown): Promise<DocumentDto> {
  const data = parseInput(DocumentInput, input)
  const divisionId = data.divisionId ?? ctx.divisionId
  if (!canCreateIn(ctx, divisionId)) {
    await auditAs(ctx, { action: 'DOCUMENT_CREATED', resourceType: 'DOCUMENT', result: 'DENIED', metadata: { divisionId } })
    throw new ServiceError('ACCESS_DENIED', 'Anda hanya dapat mendaftarkan dokumen untuk divisi Anda sendiri.')
  }
  await assertRefs(db(), data)
  const ext = resolveExternal(data)
  if (ext.externalResourceId) {
    const dup = await duplicateMessage(db(), ext.externalResourceId)
    if (dup) throw new ServiceError('CONFLICT', dup)
  }
  const created = await db().begin(async (tx) => {
    const [row] = await tx<{ document_id: string }[]>`
      insert into documents (external_resource_id, external_url, document_name, document_number, category_id, division_id,
        security_level, owner_user_id, pic_user_id, status, effective_date, expiry_date, confirmed_summary, created_by)
      values (${ext.externalResourceId}, ${ext.externalUrl}, ${data.documentName}, ${data.documentNumber}, ${data.categoryId}, ${divisionId},
        ${data.securityLevel}, ${ctx.userId}, ${data.picUserId}, 'ACTIVE', ${data.effectiveDate}, ${data.expiryDate}, ${data.confirmedSummary}, ${ctx.userId})
      returning document_id`
    await auditAs(ctx, {
      action: 'DOCUMENT_CREATED', resourceType: 'DOCUMENT', resourceId: row.document_id, result: 'SUCCESS',
      metadata: { documentName: data.documentName, securityLevel: data.securityLevel, via: 'MANUAL' },
    }, tx)
    return row.document_id
  })
  if (data.supersedesDocumentId) await supersedeDocument(ctx, created, data.supersedesDocumentId)
  return toDocumentDto((await loadDocumentRow(db(), created))!)
}

// ── get_document_metadata ───────────────────────────────────────────────
export async function getDocumentMetadata(ctx: IdentityContext, documentId: unknown): Promise<DocumentDetail> {
  const row = await loadVisibleDocument(ctx, documentId, 'DOCUMENT_VIEWED')
  const ref = async (where: 'prev' | 'next'): Promise<DocumentRef | null> => {
    const rows =
      where === 'prev'
        ? row.supersedes_document_id
          ? await db()<DocumentRow[]>`select * from documents where document_id = ${row.supersedes_document_id}`
          : []
        : await db()<DocumentRow[]>`select * from documents where supersedes_document_id = ${row.document_id}`
    const r = rows[0]
    if (!r || !canView(ctx, facts(r))) return null
    return { documentId: r.document_id, documentName: r.document_name, version: r.version, status: r.status }
  }
  return {
    ...toDocumentDto(row),
    supersedes: await ref('prev'),
    supersededBy: await ref('next'),
    permissions: { canEdit: canEditMetadata(ctx, facts(row)), canArchive: canArchive(ctx, facts(row)) },
  }
}

export interface HistoryEntry {
  action: string
  actorEmail: string | null
  actorName: string | null
  occurredAt: Date
  result: string
  metadata: Record<string, unknown>
}

/** Riwayat dokumen = audit event untuk resource ini (sumber tunggal). */
export async function getDocumentHistory(ctx: IdentityContext, documentId: unknown, limit = 50): Promise<HistoryEntry[]> {
  const row = await loadVisibleDocument(ctx, documentId, 'DOCUMENT_HISTORY_VIEWED')
  const rows = await db()<{ action: string; actor_email: string | null; name: string | null; occurred_at: Date; result: string; metadata: Record<string, unknown> }[]>`
    select a.action, a.actor_email, u.name, a.occurred_at, a.result, a.metadata
    from audit_events a left join users u on u.user_id = a.actor_user_id
    where a.resource_type = 'DOCUMENT' and a.resource_id = ${row.document_id}
    order by a.occurred_at desc, a.event_id desc limit ${limit}`
  return rows.map((r) => ({ action: r.action, actorEmail: r.actor_email, actorName: r.name, occurredAt: r.occurred_at, result: r.result, metadata: r.metadata }))
}

// ── update_document_metadata ────────────────────────────────────────────
const TRACKED: [keyof ParsedInput | 'externalResourceId', keyof DocumentRow][] = [
  ['documentName', 'document_name'],
  ['documentNumber', 'document_number'],
  ['categoryId', 'category_id'],
  ['divisionId', 'division_id'],
  ['picUserId', 'pic_user_id'],
  ['externalUrl', 'external_url'],
  ['effectiveDate', 'effective_date'],
  ['expiryDate', 'expiry_date'],
  ['confirmedSummary', 'confirmed_summary'],
]

export async function updateDocumentMetadata(ctx: IdentityContext, documentId: unknown, input: unknown): Promise<DocumentDto> {
  const row = await loadVisibleDocument(ctx, documentId, 'DOCUMENT_UPDATED')
  if (!canEditMetadata(ctx, facts(row))) return deny(ctx, row.document_id, 'DOCUMENT_UPDATED')
  const data = parseInput(DocumentInput, input)
  await assertRefs(db(), data)
  const ext = resolveExternal(data)
  if (ext.externalResourceId && ext.externalResourceId !== row.external_resource_id) {
    const dup = await duplicateMessage(db(), ext.externalResourceId)
    if (dup) throw new ServiceError('CONFLICT', dup)
  }
  const next: Record<string, unknown> = { ...data, externalUrl: ext.externalUrl, divisionId: data.divisionId ?? row.division_id }
  if (next.divisionId !== row.division_id && !canCreateIn(ctx, next.divisionId as string | null)) {
    return deny(ctx, row.document_id, 'DOCUMENT_MOVED_DIVISION', 'Anda tidak dapat memindahkan dokumen ke divisi lain.')
  }
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const [key, col] of TRACKED) {
    const before = row[col] ?? null
    const after = next[key] ?? null
    if (before !== after) changes[key] = { from: before, to: after }
  }
  await db().begin(async (tx) => {
    await tx`
      update documents set document_name = ${data.documentName}, document_number = ${data.documentNumber},
        category_id = ${data.categoryId}, division_id = ${next.divisionId as string | null}, pic_user_id = ${data.picUserId},
        external_url = ${ext.externalUrl}, external_resource_id = ${ext.externalResourceId},
        effective_date = ${data.effectiveDate}, expiry_date = ${data.expiryDate}, confirmed_summary = ${data.confirmedSummary},
        updated_at = now()
      where document_id = ${row.document_id}`
    await auditAs(ctx, { action: 'DOCUMENT_UPDATED', resourceType: 'DOCUMENT', resourceId: row.document_id, result: 'SUCCESS', metadata: { changes } }, tx)
  })
  return toDocumentDto((await loadDocumentRow(db(), row.document_id))!)
}

// ── Arsip ───────────────────────────────────────────────────────────────
export async function archiveDocument(ctx: IdentityContext, documentId: unknown) {
  const row = await loadVisibleDocument(ctx, documentId, 'DOCUMENT_ARCHIVED')
  if (!canArchive(ctx, facts(row))) return deny(ctx, row.document_id, 'DOCUMENT_ARCHIVED', 'Hanya Owner yang dapat mengarsipkan dokumen.')
  if (row.status === 'ARCHIVED') return
  await db().begin(async (tx) => {
    await tx`update documents set status = 'ARCHIVED', updated_at = now() where document_id = ${row.document_id}`
    await auditAs(ctx, { action: 'DOCUMENT_ARCHIVED', resourceType: 'DOCUMENT', resourceId: row.document_id, result: 'SUCCESS', metadata: { previousStatus: row.status } }, tx)
  })
}

// ── Versi ───────────────────────────────────────────────────────────────
export async function supersedeDocument(ctx: IdentityContext, newDocumentId: unknown, oldDocumentId: unknown) {
  const neu = await loadVisibleDocument(ctx, newDocumentId, 'DOCUMENT_SUPERSEDED')
  const old = await loadVisibleDocument(ctx, oldDocumentId, 'DOCUMENT_SUPERSEDED')
  if (neu.document_id === old.document_id) throw new ServiceError('VALIDATION', 'Dokumen tidak dapat menggantikan dirinya sendiri.')
  if (!canEditMetadata(ctx, facts(neu)) || !canEditMetadata(ctx, facts(old))) return deny(ctx, old.document_id, 'DOCUMENT_SUPERSEDED')
  if (old.status !== 'ACTIVE') throw new ServiceError('VALIDATION', 'Dokumen lama harus berstatus aktif untuk digantikan.')
  if (neu.status !== 'ACTIVE') throw new ServiceError('VALIDATION', 'Dokumen pengganti harus berstatus aktif.')
  if (neu.supersedes_document_id) throw new ServiceError('VALIDATION', 'Dokumen ini sudah menggantikan dokumen lain.')
  const [already] = await db()`select 1 from documents where supersedes_document_id = ${old.document_id}`
  if (already) throw new ServiceError('VALIDATION', 'Dokumen lama sudah digantikan oleh dokumen lain.')
  await db().begin(async (tx) => {
    await tx`update documents set supersedes_document_id = ${old.document_id}, version = ${old.version + 1}, updated_at = now() where document_id = ${neu.document_id}`
    await tx`update documents set status = 'SUPERSEDED', updated_at = now() where document_id = ${old.document_id}`
    await auditAs(ctx, {
      action: 'DOCUMENT_SUPERSEDED', resourceType: 'DOCUMENT', resourceId: old.document_id, result: 'SUCCESS',
      metadata: { supersededBy: neu.document_id, newVersion: old.version + 1 },
    }, tx)
    await auditAs(ctx, {
      action: 'DOCUMENT_VERSION_LINKED', resourceType: 'DOCUMENT', resourceId: neu.document_id, result: 'SUCCESS',
      metadata: { supersedes: old.document_id, version: old.version + 1 },
    }, tx)
  })
}

// ── Daftar ──────────────────────────────────────────────────────────────
export interface ListOptions {
  /** ACTIVE (default) | INACTIVE (arsip & versi lama) | ALL */
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL'
  scope?: 'all' | 'mine' | 'division'
  limit?: number
}

export async function listDocuments(ctx: IdentityContext, opts: ListOptions): Promise<DocumentDto[]> {
  const q = db()
  const status = opts.status ?? 'ACTIVE'
  const rows = await q<DocumentRow[]>`
    ${documentSelect(q)}
    where ${visibleDocumentsWhere(q, ctx)}
      and ${status === 'ACTIVE' ? q`d.status = 'ACTIVE'` : status === 'INACTIVE' ? q`d.status in ('SUPERSEDED','ARCHIVED')` : q`d.status <> 'DRAFT'`}
      and ${opts.scope === 'mine' ? q`d.pic_user_id = ${ctx.userId}` : opts.scope === 'division' ? q`d.division_id = ${ctx.divisionId}` : q`true`}
    order by d.updated_at desc
    limit ${opts.limit ?? 200}`
  return rows.map((r) => toDocumentDto(r))
}

// ── Direktori user untuk pilihan PIC ───────────────────────────────────
export async function listUserOptions(_ctx: IdentityContext) {
  return db()<{ user_id: string; name: string; email: string; division_name: string | null }[]>`
    select u.user_id, u.name, u.email, d.division_name from users u left join divisions d on d.division_id = u.division_id
    where u.status <> 'DEACTIVATED' order by u.name`
}
