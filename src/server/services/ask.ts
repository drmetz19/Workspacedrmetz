import { z } from 'zod'
import { withUserScope } from '../db'
import { auditAs } from '../audit'
import { ServiceError } from '../errors'
import type { IdentityContext } from '../context'
import { parseInput } from '../validation'
import { visibleDocumentsWhere } from '../permissions/sql'
import { loadGrantsFor } from '../permissions/grants'
import { AiUnavailableError } from '../integrations/ai'
import { answerFromDocuments, type AskContextDoc } from '../ai/orchestrator'
import { documentSelect, secureDocumentDto, type DocumentDto, type DocumentRow } from './documents'
import { todayJakarta } from './search'
import { listPendingApprovals } from './access'

const STOP = new Set(['cari', 'carikan', 'tolong', 'yang', 'dan', 'di', 'ke', 'apa', 'saja', 'mana', 'dokumen', 'terbaru', 'terakhir', 'untuk', 'dari', 'ada', 'tidak', 'apakah', 'berapa', 'kapan', 'siapa', 'tampilkan', 'saya', 'kita', 'the', 'dengan', 'itu', 'ini', 'sudah', 'belum', 'akan', 'bisa', 'mau', 'minta', 'lihat', 'file'])
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

export function questionTokens(q: string) {
  return norm(q).split(/[^a-z0-9/.-]+/).filter((t) => t.length > 1 && !STOP.has(t))
}

/** Skor kandidat: jumlah token pertanyaan yang muncul di metadata yang SUDAH diamankan. */
function relevance(d: DocumentDto, tokens: string[]) {
  const hay = norm([d.documentName, d.documentNumber, d.categoryName, d.divisionName, d.picName, d.confirmedSummary].filter(Boolean).join(' '))
  return tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0)
}

const AskInput = z.object({ question: z.string().trim().min(3, 'pertanyaan terlalu pendek').max(500) })

export interface AskCitation {
  ref: string
  documentId: string
  documentName: string
  status: string
  securityLevel: number
  version: number
  expiryDate: string | null
}

export interface AskResult {
  answer: string
  found: boolean
  citations: AskCitation[]
  contextSize: number
  provider: string
  permissionScopeApplied: true
}

/**
 * Ask AI: intent → identity → permission scope → retrieval (metadata + ringkasan terkonfirmasi) → AI → output policy.
 * Konteks dibangun HANYA dari dokumen yang boleh diketahui user (RLS + engine), dan ringkasan/nomor hanya
 * untuk dokumen yang boleh dibuka — filter terjadi SEBELUM apa pun dikirim ke model.
 */
export async function askDocuments(ctx: IdentityContext, input: unknown): Promise<AskResult> {
  const { question } = parseInput(AskInput, input)
  const today = todayJakarta()
  const tokens = questionTokens(question)
  const wantsExpiry = /kedaluwarsa|kadaluarsa|kadaluwarsa|expired|expir|habis|jatuh tempo|perpanjang/i.test(question)
  const wantsApprovals = /approval|persetujuan|menunggu/i.test(question)

  const visible = await withUserScope(ctx.userId, async (q) => {
    const rows = await q<DocumentRow[]>`${documentSelect(q)}
      where ${visibleDocumentsWhere(q, ctx)} and d.status in ('ACTIVE','SUPERSEDED')
      order by d.updated_at desc limit 500`
    const grants = await loadGrantsFor(q, rows.map((r) => r.document_id))
    return rows.map((r) => secureDocumentDto(ctx, r, grants.get(r.document_id) ?? []))
  })

  const in90 = new Date(`${today}T00:00:00Z`)
  in90.setUTCDate(in90.getUTCDate() + 90)
  const limitDate = in90.toISOString().slice(0, 10)
  const scored = visible
    .map((d) => ({ d, score: relevance(d, tokens) + (wantsExpiry && d.status === 'ACTIVE' && d.expiryDate && d.expiryDate <= limitDate ? 2 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.d.status === 'ACTIVE' ? -1 : 1) || b.d.version - a.d.version)
    .slice(0, 25)

  const docs: AskContextDoc[] = scored.map(({ d }, i) => ({
    ref: `D${i + 1}`,
    name: d.documentName,
    status: d.status,
    version: d.version,
    level: d.securityLevel,
    category: d.categoryName,
    division: d.divisionName,
    pic: d.picName,
    number: d.documentNumber,
    effectiveDate: d.effectiveDate,
    expiryDate: d.expiryDate,
    summary: d.confirmedSummary,
  }))
  const byRef = new Map(scored.map(({ d }, i) => [`D${i + 1}`, d]))
  const pending = wantsApprovals ? (await listPendingApprovals(ctx)).length : null

  if (docs.length === 0 && pending === null) {
    await auditAs(ctx, { action: 'AI_DOCUMENT_QUERIED', resourceType: 'AI', result: 'SUCCESS', metadata: { question, contextSize: 0, citedDocumentIds: [], found: false, provider: 'none' } })
    return {
      answer: 'Saya tidak menemukan dokumen yang sesuai di antara dokumen yang boleh Anda akses. Coba pencarian filter atau gunakan kata kunci lain.',
      found: false, citations: [], contextSize: 0, provider: 'none', permissionScopeApplied: true,
    }
  }

  let out
  try {
    out = await answerFromDocuments({ question, today, docs, pendingApprovals: pending })
  } catch (e) {
    await auditAs(ctx, { action: 'AI_DOCUMENT_QUERIED', resourceType: 'AI', result: 'FAILED', metadata: { question, contextSize: docs.length, error: e instanceof Error ? e.message : 'error' } })
    if (e instanceof AiUnavailableError || e instanceof z.ZodError) throw new ServiceError('UNAVAILABLE', 'AI sementara tidak tersedia. Gunakan pencarian filter untuk sementara.')
    throw new ServiceError('UNAVAILABLE', 'AI sementara tidak tersedia. Gunakan pencarian filter untuk sementara.')
  }
  const citations: AskCitation[] = out.citations.map((ref) => {
    const d = byRef.get(ref)!
    return { ref, documentId: d.documentId, documentName: d.documentName, status: d.status, securityLevel: d.securityLevel, version: d.version, expiryDate: d.expiryDate }
  })
  await auditAs(ctx, {
    action: 'AI_DOCUMENT_QUERIED', resourceType: 'AI', result: 'SUCCESS',
    metadata: { question, contextSize: docs.length, citedDocumentIds: citations.map((c) => c.documentId), found: out.found, provider: out.provider },
  })
  return { answer: out.answer, found: out.found, citations, contextSize: docs.length, provider: out.provider, permissionScopeApplied: true }
}
