import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { createDriveSource, scanSource } from '@/server/services/sources'
import { listDraftsForReview } from '@/server/services/review'
import { setAiProviderForTest, type AiProvider, type AiRequest } from '@/server/integrations/ai'
import { mockAiProvider } from '@/server/integrations/ai/mock'
import { extractPdfText } from '@/server/integrations/drive/pdf-text'
import { closeDb, createUser, divisionId, resetDb } from './helpers'

beforeEach(resetDb)
afterEach(() => setAiProviderForTest(null))
afterAll(closeDb)

/** Provider "spy": membungkus mock untuk merekam payload yang dikirim ke AI. */
function spy(): AiProvider & { calls: AiRequest[] } {
  const calls: AiRequest[] = []
  return { name: 'spy', calls, isConfigured: () => true, generate: async (r) => (calls.push(r), mockAiProvider.generate(r)) }
}

async function addFile(container: string, id: string, name: string, text: string | null, mime = 'application/pdf') {
  await db()`insert into dev_drive_files (container_id, file_id, name, mime_type, text_content) values (${container}, ${id}, ${name}, ${mime}, ${text})`
}

const IZIN_TEXT = 'PEMERINTAH PROVINSI DKI JAKARTA. Izin Operasional Klinik Pratama DrMetz. Nomor: 503/IO/2025/0182. Ditetapkan tanggal 10-01-2025. Berlaku sampai 10-01-2030. Penanggung jawab: Rina'
const KONTRAK_TEXT = 'PERJANJIAN KERJASAMA pengadaan alat laser. Nilai kontrak Rp 1.250.000.000. Penalti 5% per minggu keterlambatan.'

async function setup() {
  const owner = await createUser({ role: 'OWNER' })
  await createUser({ name: 'Rina' })
  const legal = await divisionId()
  await addFile('mock-standar', 'S1', 'scan_izin_jakarta.pdf', IZIN_TEXT)
  await addFile('mock-standar', 'S2', 'foto_sertifikat.jpg', null, 'image/jpeg')
  await addFile('mock-terbatas', 'R1', 'PKS Laser AEVIA.pdf', KONTRAK_TEXT)
  const std = await createDriveSource(owner, { folder: 'mock-standar', sourceType: 'STANDARD', defaultDivisionId: legal })
  const res = await createDriveSource(owner, { folder: 'mock-terbatas', sourceType: 'RESTRICTED', defaultDivisionId: legal })
  return { owner, std, res }
}

describe('AI saran metadata', () => {
  it('Draft folder STANDARD berisi saran AI dari isi file (nomor, tanggal, PIC, ringkasan)', async () => {
    const p = spy()
    setAiProviderForTest(p)
    const { owner, std } = await setup()
    await scanSource(owner, std.sourceId)
    const d = (await listDraftsForReview(owner)).find((x) => x.externalResourceId === 'S1')!
    const ai = d.suggestions.find((s) => s.source === 'AI')!
    expect(ai.inputScope).toBe('CONTENT')
    expect(d.suggested).toMatchObject({
      categoryName: 'Izin Operasional', documentNumber: '503/IO/2025/0182', effectiveDate: '2025-01-10', expiryDate: '2030-01-10', picName: 'Rina',
    })
    expect(d.suggested.summary).toContain('Izin Operasional')
    expect(d.expiryDate).toBeNull() // tetap saran, belum field final
  })

  it('Folder RESTRICTED: payload ke AI tidak berisi isi file sama sekali', async () => {
    const p = spy()
    setAiProviderForTest(p)
    const { owner, res } = await setup()
    await scanSource(owner, res.sourceId)
    expect(p.calls.length).toBe(1)
    const sent = p.calls[0].system + p.calls[0].prompt
    expect(sent).not.toContain('Penalti')
    expect(sent).not.toContain('1.250.000.000')
    expect(sent).not.toContain('"text"')
    const [d] = await listDraftsForReview(owner)
    expect(d.suggestions.find((s) => s.source === 'AI')).toMatchObject({ inputScope: 'FILENAME_METADATA' })
    expect(d.suggested.securityLevel).toBeGreaterThanOrEqual(3)
    expect(d.suggested.summary).toBeUndefined()
  })

  it('File tak terbaca (gambar scan) → draft tetap dibuat dengan flag CONTENT_UNREADABLE', async () => {
    setAiProviderForTest(spy())
    const { owner, std } = await setup()
    await scanSource(owner, std.sourceId)
    const d = (await listDraftsForReview(owner)).find((x) => x.externalResourceId === 'S2')!
    expect(d.flags.contentUnreadable).toBe(true)
    expect(d.suggestions.find((s) => s.source === 'AI')?.inputScope).toBe('FILENAME_METADATA')
    expect(d.suggested.categoryName).toBe('Sertifikat')
  })

  it('Keluaran AI divalidasi: kategori di luar daftar & tanggal ngawur dibuang, level folder terbatas tetap ≥3', async () => {
    setAiProviderForTest({
      name: 'nakal', isConfigured: () => true,
      generate: async () => ({ provider: 'nakal', text: 'Berikut: {"categoryName":"Rahasia Negara","expiryDate":"31/02/2030","securityLevel":1,"documentName":"X"} ok' }),
    })
    const { owner, res } = await setup()
    await scanSource(owner, res.sourceId)
    const [d] = await listDraftsForReview(owner)
    const ai = d.suggestions.find((s) => s.source === 'AI')!
    expect(ai.fields.categoryName).toBeUndefined()
    expect(ai.fields.expiryDate).toBeUndefined()
    expect(ai.fields.securityLevel).toBe(3)
  })

  it('Provider AI gagal / tidak dikonfigurasi → scan tetap berhasil dengan saran heuristik', async () => {
    setAiProviderForTest({ name: 'down', isConfigured: () => true, generate: async () => { throw new Error('timeout') } })
    const { owner, std } = await setup()
    expect(await scanSource(owner, std.sourceId)).toMatchObject({ created: 2 })
    const drafts = await listDraftsForReview(owner)
    expect(drafts.every((d) => d.suggestions.every((s) => s.source === 'HEURISTIC'))).toBe(true)
  })

  it('Mengganti provider tidak memerlukan perubahan service (provider kustom langsung dipakai)', async () => {
    setAiProviderForTest({ name: 'vendor-b', isConfigured: () => true, generate: async () => ({ provider: 'vendor-b:model-x', text: '{"categoryName":"MoU"}' }) })
    const { owner, std } = await setup()
    await scanSource(owner, std.sourceId)
    const d = (await listDraftsForReview(owner))[0]
    expect(d.suggestions.find((s) => s.source === 'AI')).toMatchObject({ provider: 'vendor-b:model-x', fields: { categoryName: 'MoU' } })
  })
})

describe('ekstraksi teks PDF', () => {
  it('Membaca teks dari PDF sederhana; non-PDF → null', () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Length 60 >>\nstream\nBT /F1 12 Tf (Izin Operasional Klinik Pratama Jakarta) Tj ET\nendstream\nendobj\n%%EOF', 'latin1')
    expect(extractPdfText(pdf)).toBe('Izin Operasional Klinik Pratama Jakarta')
    expect(extractPdfText(Buffer.from('bukan pdf'))).toBeNull()
  })
})
