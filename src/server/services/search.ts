import { z } from 'zod'
import { withUserScope } from '../db'
import type { IdentityContext } from '../context'
import { optionalDate, optionalUuid, parseInput } from '../validation'
import { visibleDocumentsWhere } from '../permissions/sql'
import { loadGrantsFor } from '../permissions/grants'
import { documentSelect, secureDocumentDto, type DocumentDto, type DocumentRow } from './documents'

/**
 * search_documents — pencarian terstruktur.
 * 1) Filter struktural + scope izin dijalankan di DB (RLS + csse_can_view_document).
 * 2) Keyword dicocokkan pada DTO yang SUDAH diamankan, sehingga nomor & ringkasan dokumen
 *    yang belum boleh dibuka tidak bisa "ditebak" lewat kata kunci.
 */
const asArray = z
  .union([z.string(), z.array(z.string())])
  .nullish()
  .transform((v) => (v === null || v === undefined || v === '' ? [] : (Array.isArray(v) ? v : [v]).filter((x) => x !== '')))

const SearchInput = z.object({
  q: z.string().trim().max(200).nullish().transform((v) => v ?? ''),
  categoryId: optionalUuid,
  divisionId: optionalUuid,
  picUserId: optionalUuid,
  securityLevel: asArray.transform((arr, ctx) => {
    const out = arr.map(Number)
    if (out.some((n) => !Number.isInteger(n) || n < 1 || n > 5)) {
      ctx.addIssue({ code: 'custom', message: 'level harus 1–5' })
      return z.NEVER
    }
    return out
  }),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).nullish().transform((v) => v ?? 'ACTIVE'),
  effectiveFrom: optionalDate,
  effectiveTo: optionalDate,
  expiry: z.enum(['', 'expired', 'within30', 'within90', 'none']).nullish().transform((v) => v || null),
  expiryFrom: optionalDate,
  expiryTo: optionalDate,
  /** Untuk test / zona waktu: tanggal "hari ini" (YYYY-MM-DD). Default: hari ini Asia/Jakarta. */
  today: optionalDate,
  limit: z.coerce.number().int().min(1).max(200).nullish().transform((v) => v ?? 100),
})

export type SearchFilters = z.input<typeof SearchInput>

export interface SearchResultItem extends DocumentDto {
  supersededByDocumentId: string | null
  score: number
}

export interface SearchResponse {
  results: SearchResultItem[]
  total: number
  permissionScopeApplied: true
  filters: z.infer<typeof SearchInput>
}

export const todayJakarta = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Skor relevansi sederhana: semua token wajib cocok; nama dokumen bernilai paling tinggi. */
export function scoreDocument(dto: DocumentDto, q: string): number {
  const tokens = norm(q).split(/[^a-z0-9/.-]+/).filter((t) => t.length > 0)
  if (!tokens.length) return 1
  const fields: [string | null, number][] = [
    [dto.documentName, 5],
    [dto.documentNumber, 4],
    [dto.categoryName, 3],
    [dto.picName, 2],
    [dto.divisionName, 2],
    [dto.confirmedSummary, 1],
  ]
  let score = 0
  for (const t of tokens) {
    let best = 0
    for (const [v, w] of fields) if (v && norm(v).includes(t)) best = Math.max(best, w)
    if (!best) return 0
    score += best
  }
  return score
}

export async function searchDocuments(ctx: IdentityContext, input: unknown): Promise<SearchResponse> {
  const f = parseInput(SearchInput, input ?? {})
  const today = f.today ?? todayJakarta()
  const rows = await withUserScope(ctx.userId, async (q) => {
    const rows = await q<(DocumentRow & { superseded_by: string | null })[]>`
      select x.*, (select n.document_id from documents n where n.supersedes_document_id = x.document_id limit 1) as superseded_by
      from (${documentSelect(q)}
        where ${visibleDocumentsWhere(q, ctx)}
          and ${f.status === 'ACTIVE' ? q`d.status = 'ACTIVE'` : f.status === 'INACTIVE' ? q`d.status in ('SUPERSEDED','ARCHIVED')` : q`d.status <> 'DRAFT'`}
          and ${f.categoryId ? q`d.category_id = ${f.categoryId}` : q`true`}
          and ${f.divisionId ? q`d.division_id = ${f.divisionId}` : q`true`}
          and ${f.picUserId ? q`d.pic_user_id = ${f.picUserId}` : q`true`}
          and ${f.securityLevel.length ? q`d.security_level = any(${f.securityLevel}::int[])` : q`true`}
          and ${f.effectiveFrom ? q`d.effective_date >= ${f.effectiveFrom}` : q`true`}
          and ${f.effectiveTo ? q`d.effective_date <= ${f.effectiveTo}` : q`true`}
          and ${f.expiryFrom ? q`d.expiry_date >= ${f.expiryFrom}` : q`true`}
          and ${f.expiryTo ? q`d.expiry_date <= ${f.expiryTo}` : q`true`}
          and ${
            f.expiry === 'expired' ? q`d.expiry_date < ${today}`
            : f.expiry === 'within30' ? q`d.expiry_date >= ${today} and d.expiry_date <= ${addDays(today, 30)}`
            : f.expiry === 'within90' ? q`d.expiry_date >= ${today} and d.expiry_date <= ${addDays(today, 90)}`
            : f.expiry === 'none' ? q`d.expiry_date is null`
            : q`true`
          }
        order by d.updated_at desc
        limit 1000) x`
    const grants = await loadGrantsFor(q, rows.map((r) => r.document_id))
    return rows.map((r) => ({ r, grants: grants.get(r.document_id) ?? [] }))
  })

  const scored: SearchResultItem[] = []
  for (const { r, grants } of rows) {
    const dto = secureDocumentDto(ctx, r, grants)
    const score = scoreDocument(dto, f.q)
    if (score > 0) scored.push({ ...dto, supersededByDocumentId: r.superseded_by, score })
  }
  const statusRank = (s: string) => (s === 'ACTIVE' ? 0 : s === 'SUPERSEDED' ? 1 : 2)
  scored.sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.score - a.score || b.version - a.version || +b.updatedAt - +a.updatedAt)
  return { results: scored.slice(0, f.limit), total: scored.length, permissionScopeApplied: true, filters: f }
}
