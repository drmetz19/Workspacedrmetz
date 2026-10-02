import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { createDocumentRecord, supersedeDocument } from '@/server/services/documents'
import { askDocuments } from '@/server/services/ask'
import { searchDocuments } from '@/server/services/search'
import { setAiProviderForTest, type AiProvider, type AiRequest } from '@/server/integrations/ai'
import { mockAiProvider } from '@/server/integrations/ai/mock'
import { auditActions, closeDb, createUser, divisionId, resetDb } from './helpers'

beforeEach(resetDb)
afterEach(() => setAiProviderForTest(null))
afterAll(closeDb)

function spy(): AiProvider & { calls: AiRequest[] } {
  const calls: AiRequest[] = []
  return { name: 'spy', calls, isConfigured: () => true, generate: async (r) => (calls.push(r), mockAiProvider.generate(r)) }
}
const cat = async (n: string) => (await db()<{ category_id: string }[]>`select category_id from categories where category_name = ${n}`)[0].category_id
let k = 0
const url = () => `https://drive.google.com/file/d/ASKFILE${++k}abcdef/view`

async function seed() {
  const owner = await createUser({ role: 'OWNER' })
  const pic = await createUser({ name: 'Rina' })
  const staf = await createUser()
  const hr = await createUser({ division: 'HR', name: 'Staf HR' })
  const legal = await divisionId()
  const hrDiv = await divisionId('HR')
  const old = await createDocumentRecord(owner, { documentName: 'Izin Operasional Klinik Jakarta 2020', categoryId: await cat('Izin Operasional'), divisionId: legal, picUserId: pic.userId, securityLevel: '2', expiryDate: '2025-01-01', externalUrl: url() })
  const cur = await createDocumentRecord(owner, { documentName: 'Izin Operasional Klinik Jakarta 2025', documentNumber: '503/IO/2025', categoryId: await cat('Izin Operasional'), divisionId: legal, picUserId: pic.userId, securityLevel: '2', expiryDate: '2030-01-10', confirmedSummary: 'Izin operasional klinik pratama cabang Jakarta Selatan', externalUrl: url() })
  await supersedeDocument(owner, cur.documentId, old.documentId)
  const exec = await createDocumentRecord(owner, { documentName: 'Laporan Keuangan Eksekutif Finance', categoryId: await cat('Lainnya'), divisionId: hrDiv, securityLevel: '5', confirmedSummary: 'Laba bersih rahasia Rp 9 miliar', externalUrl: url() })
  const kontrak = await createDocumentRecord(owner, { documentName: 'Kontrak Vendor Laser', documentNumber: 'PKS-77', categoryId: await cat('Kontrak'), divisionId: legal, picUserId: pic.userId, securityLevel: '3', confirmedSummary: 'Penalti keterlambatan 5% per minggu', externalUrl: url() })
  return { owner, pic, staf, hr, old, cur, exec, kontrak }
}

describe('Ask AI', () => {
  it('"cari izin operasional klinik Jakarta terbaru" → dokumen ACTIVE yang benar dengan sitasi', async () => {
    setAiProviderForTest(spy())
    const s = await seed()
    const r = await askDocuments(s.owner, { question: 'Cari izin operasional klinik Jakarta terbaru' })
    expect(r.found).toBe(true)
    expect(r.citations[0]).toMatchObject({ documentId: s.cur.documentId, status: 'ACTIVE' })
    expect(r.answer).toContain('[D1]')
    expect(r.permissionScopeApplied).toBe(true)
  })

  it('Konteks ke AI hanya berisi dokumen dalam scope user; ringkasan dokumen yang belum boleh dibuka tidak dikirim', async () => {
    const p = spy()
    setAiProviderForTest(p)
    const s = await seed()
    await askDocuments(s.staf, { question: 'kontrak vendor laser penalti' })
    const sent = p.calls.map((c) => c.prompt).join('\n')
    expect(sent).toContain('Kontrak Vendor Laser')
    expect(sent).not.toContain('Penalti keterlambatan')
    expect(sent).not.toContain('PKS-77')
    expect(sent).not.toContain('Eksekutif')
    p.calls.length = 0
    await askDocuments(s.pic, { question: 'kontrak vendor laser penalti' })
    expect(p.calls.map((c) => c.prompt).join('\n')).toContain('Penalti keterlambatan')
  })

  it('Scenario 2: user HR bertanya dokumen Executive → tidak ada petunjuk isi/keberadaan', async () => {
    const p = spy()
    setAiProviderForTest(p)
    const s = await seed()
    const r = await askDocuments(s.hr, { question: 'berapa laba bersih di laporan keuangan eksekutif finance?' })
    expect(r.found).toBe(false)
    expect(r.citations).toEqual([])
    expect(r.answer).not.toMatch(/9 miliar|Eksekutif|Laba/i)
    expect(p.calls.map((c) => c.prompt).join('\n')).not.toContain('Eksekutif')
  })

  it('Tidak ada hasil → menyatakan tidak menemukan & menyarankan pencarian filter (tidak mengarang)', async () => {
    setAiProviderForTest(spy())
    const s = await seed()
    const r = await askDocuments(s.owner, { question: 'sertifikat halal dapur Bali' })
    expect(r.found).toBe(false)
    expect(r.answer).toMatch(/tidak menemukan/i)
  })

  it('Output policy: sitasi di luar daftar dibuang', async () => {
    setAiProviderForTest({ name: 'nakal', isConfigured: () => true, generate: async () => ({ provider: 'nakal', text: '{"answer":"Lihat [D1] dan juga [D99] rahasia","citations":["D1","D99"],"found":true}' }) })
    const s = await seed()
    const r = await askDocuments(s.owner, { question: 'izin jakarta' })
    expect(r.citations.map((c) => c.ref)).toEqual(['D1'])
    expect(r.answer).not.toContain('D99')
  })

  it('Provider AI mati → UNAVAILABLE dengan pesan jelas; pencarian filter tetap jalan; diaudit FAILED', async () => {
    setAiProviderForTest({ name: 'down', isConfigured: () => true, generate: async () => { const { AiUnavailableError } = await import('@/server/integrations/ai'); throw new AiUnavailableError() } })
    const s = await seed()
    await expect(askDocuments(s.owner, { question: 'izin jakarta' })).rejects.toMatchObject({ code: 'UNAVAILABLE', message: expect.stringContaining('AI sementara tidak tersedia') })
    expect((await searchDocuments(s.owner, { q: 'izin jakarta' })).results.length).toBe(1)
    expect((await auditActions({ action: 'AI_DOCUMENT_QUERIED' }))[0].result).toBe('FAILED')
  })

  it('Setiap query tercatat di audit (pertanyaan & dokumen yang disitasi)', async () => {
    setAiProviderForTest(spy())
    const s = await seed()
    await askDocuments(s.owner, { question: 'izin operasional jakarta' })
    const [a] = await auditActions({ action: 'AI_DOCUMENT_QUERIED' })
    expect(a.metadata).toMatchObject({ question: 'izin operasional jakarta' })
    expect((a.metadata.citedDocumentIds as string[])[0]).toBe(s.cur.documentId)
  })
})
