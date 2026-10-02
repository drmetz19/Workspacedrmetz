import { db } from '../db'
import { auditAs } from '../audit'
import { ServiceError } from '../errors'
import type { IdentityContext } from '../context'
import { optionalText, parseInput } from '../validation'
import { decide, maxLevelOnCreate } from '../permissions/engine'
import { DocumentInput, facts, listDocuments, loadDocumentRow, loadVisibleDocumentWithGrants, secureDocumentDto, type DocumentDto } from './documents'
import type { SuggestedFields } from './suggest'

export interface Suggestion {
  source: 'HEURISTIC' | 'AI'
  provider: string | null
  inputScope: 'FILENAME_METADATA' | 'CONTENT'
  fields: SuggestedFields
  createdAt: Date
}

export interface DraftForReview extends DocumentDto {
  suggestions: Suggestion[]
  /** Saran terbaik per field (AI > heuristik) — dipakai untuk mengisi form; tetap harus dikonfirmasi. */
  suggested: SuggestedFields
  restrictedSource: boolean
  sourceName: string | null
}

async function suggestionsFor(documentIds: string[]) {
  const map = new Map<string, Suggestion[]>()
  if (!documentIds.length) return map
  const rows = await db()<{ document_id: string; source: 'HEURISTIC' | 'AI'; provider: string | null; input_scope: 'FILENAME_METADATA' | 'CONTENT'; fields: SuggestedFields; created_at: Date }[]>`
    select document_id, source, provider, input_scope, fields, created_at from document_suggestions
    where document_id = any(${documentIds}::uuid[]) order by created_at desc`
  for (const r of rows) {
    const list = map.get(r.document_id) ?? []
    list.push({ source: r.source, provider: r.provider, inputScope: r.input_scope, fields: r.fields, createdAt: r.created_at })
    map.set(r.document_id, list)
  }
  return map
}

export function mergeSuggestions(list: Suggestion[]): SuggestedFields {
  const ordered = [...list].sort((a, b) => (a.source === b.source ? 0 : a.source === 'AI' ? 1 : -1)) // heuristik dulu, AI menimpa
  return ordered.reduce<SuggestedFields>((acc, s) => {
    for (const [k, v] of Object.entries(s.fields)) if (v !== null && v !== undefined && v !== '') (acc as Record<string, unknown>)[k] = v
    return acc
  }, {})
}

export async function listDraftsForReview(ctx: IdentityContext): Promise<DraftForReview[]> {
  const drafts = await listDocuments(ctx, { status: 'DRAFT', limit: 500 })
  const sugg = await suggestionsFor(drafts.map((d) => d.documentId))
  const sources = await db()<{ source_id: string; name: string; source_type: string }[]>`select source_id, name, source_type from drive_sources`
  const bySource = new Map(sources.map((s) => [s.source_id, s]))
  return drafts.map((d) => {
    const s = d.sourceId ? bySource.get(d.sourceId) : undefined
    const list = sugg.get(d.documentId) ?? []
    return { ...d, suggestions: list, suggested: mergeSuggestions(list), restrictedSource: s?.source_type === 'RESTRICTED', sourceName: s?.name ?? null }
  })
}

export async function getDraftForReview(ctx: IdentityContext, documentId: unknown): Promise<DraftForReview> {
  const { row, grants } = await loadVisibleDocumentWithGrants(ctx, documentId, 'DRAFT_REVIEWED')
  if (row.status !== 'DRAFT') throw new ServiceError('VALIDATION', 'Dokumen ini bukan draft.')
  const list = (await suggestionsFor([row.document_id])).get(row.document_id) ?? []
  const [s] = row.source_id ? await db()<{ name: string; source_type: string }[]>`select name, source_type from drive_sources where source_id = ${row.source_id}` : []
  return { ...secureDocumentDto(ctx, row, grants), suggestions: list, suggested: mergeSuggestions(list), restrictedSource: s?.source_type === 'RESTRICTED', sourceName: s?.name ?? null }
}

async function loadDraftForReviewer(ctx: IdentityContext, documentId: unknown, attempted: string) {
  const { row, grants } = await loadVisibleDocumentWithGrants(ctx, documentId, attempted)
  if (row.status !== 'DRAFT') throw new ServiceError('VALIDATION', 'Draft ini sudah direview.')
  if (!decide(ctx, facts(row), 'EDIT_METADATA', grants).allowed) {
    await auditAs(ctx, { action: 'ACCESS_DENIED', resourceType: 'DOCUMENT', resourceId: row.document_id, result: 'DENIED', metadata: { attempted } })
    throw new ServiceError('ACCESS_DENIED', 'Anda tidak dapat mereview draft ini.')
  }
  return row
}

/** Konfirmasi: field final ditulis dari input reviewer (bukan langsung dari saran), status → ACTIVE. */
export async function confirmDraft(ctx: IdentityContext, documentId: unknown, input: unknown): Promise<DocumentDto> {
  const row = await loadDraftForReviewer(ctx, documentId, 'DOCUMENT_CONFIRMED')
  const data = parseInput(DocumentInput, input)
  const [src] = row.source_id ? await db()<{ source_type: string }[]>`select source_type from drive_sources where source_id = ${row.source_id}` : []
  const restricted = src?.source_type === 'RESTRICTED'
  if (restricted && data.securityLevel < 3) throw new ServiceError('VALIDATION', 'securityLevel: file dari folder terbatas minimal L3.')
  if (!restricted && data.securityLevel >= 3 && ctx.roleId !== 'OWNER')
    throw new ServiceError('VALIDATION', 'securityLevel: dokumen L3–5 harus disimpan di folder terbatas. Pindahkan file atau minta Owner.')
  if (data.securityLevel > maxLevelOnCreate(ctx)) throw new ServiceError('VALIDATION', `securityLevel: maksimal L${maxLevelOnCreate(ctx)} untuk role Anda.`)
  for (const [table, col, val, label] of [
    ['categories', 'category_id', data.categoryId, 'kategori'],
    ['divisions', 'division_id', data.divisionId, 'divisi'],
    ['users', 'user_id', data.picUserId, 'PIC'],
  ] as const) {
    if (val && !(await db().unsafe(`select 1 from ${table} where ${col} = $1`, [val])).length)
      throw new ServiceError('VALIDATION', `${label} tidak ditemukan`)
  }
  await db().begin(async (tx) => {
    await tx`
      update documents set document_name = ${data.documentName}, document_number = ${data.documentNumber}, category_id = ${data.categoryId},
        division_id = ${data.divisionId ?? row.division_id}, pic_user_id = ${data.picUserId}, security_level = ${data.securityLevel},
        effective_date = ${data.effectiveDate}, expiry_date = ${data.expiryDate}, confirmed_summary = ${data.confirmedSummary},
        status = 'ACTIVE', reviewed_by = ${ctx.userId}, reviewed_at = now(), updated_at = now()
      where document_id = ${row.document_id} and status = 'DRAFT'`
    await auditAs(ctx, {
      action: 'DOCUMENT_CONFIRMED', resourceType: 'DOCUMENT', resourceId: row.document_id, result: 'SUCCESS',
      metadata: { securityLevel: data.securityLevel, documentName: data.documentName },
    }, tx)
  })
  const updated = (await loadDocumentRow(db(), row.document_id))!
  return secureDocumentDto(ctx, updated, [])
}

export async function rejectDraft(ctx: IdentityContext, documentId: unknown, note: unknown) {
  const row = await loadDraftForReviewer(ctx, documentId, 'DOCUMENT_REJECTED')
  const reason = parseInput(optionalText, note)
  await db().begin(async (tx) => {
    await tx`update documents set status = 'REJECTED', reviewed_by = ${ctx.userId}, reviewed_at = now(), review_note = ${reason}, updated_at = now()
             where document_id = ${row.document_id}`
    await auditAs(ctx, { action: 'DOCUMENT_REJECTED', resourceType: 'DOCUMENT', resourceId: row.document_id, result: 'SUCCESS', metadata: { note: reason } }, tx)
  })
}
