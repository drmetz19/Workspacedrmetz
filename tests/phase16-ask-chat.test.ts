import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDocumentRecord } from '@/server/services/documents'
import { askDocuments, listAskHistory, recordAskFeedback } from '@/server/services/ask'
import { setAiProviderForTest } from '@/server/integrations/ai'
import { mockAiProvider } from '@/server/integrations/ai/mock'
import { auditActions, closeDb, createUser, divisionId, resetDb } from './helpers'

beforeEach(async () => {
  await resetDb()
  setAiProviderForTest(mockAiProvider)
})
afterEach(() => setAiProviderForTest(null))
afterAll(closeDb)

describe('Tanya Dokumen — percakapan', () => {
  it('Sitasi berisi detail untuk kartu "Ditemukan dokumen resmi" (nomor disembunyikan bila belum boleh buka)', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const pic = await createUser({ name: 'Hendra Wijaya' })
    const staf = await createUser({ division: 'Legal/Perizinan' })
    const legal = await divisionId()
    await createDocumentRecord(owner, {
      documentName: 'Izin Operasional Klinik Jakarta', documentNumber: '445/8821/DINKES/2025', divisionId: legal, picUserId: pic.userId,
      securityLevel: '2', effectiveDate: '2025-02-01', expiryDate: '2028-02-28', externalUrl: 'https://drive.google.com/file/d/1IzinJkt2025abc/view',
    })
    await createDocumentRecord(owner, { documentName: 'Kontrak Izin Vendor Rahasia', documentNumber: 'PKS-99', divisionId: legal, securityLevel: '3', externalUrl: 'https://drive.google.com/file/d/1KontrakRhs01/view' })

    const r = await askDocuments(owner, { question: 'izin operasional klinik jakarta' })
    expect(r.citations[0]).toMatchObject({
      documentName: 'Izin Operasional Klinik Jakarta', documentNumber: '445/8821/DINKES/2025', picName: 'Hendra Wijaya',
      divisionName: 'Legal/Perizinan', effectiveDate: '2025-02-01', expiryDate: '2028-02-28', canOpen: true, hasFile: true, openMode: 'DRIVE',
    })

    const s = await askDocuments(staf, { question: 'kontrak izin vendor rahasia' })
    const c = s.citations.find((x) => x.documentName === 'Kontrak Izin Vendor Rahasia')
    expect(c).toMatchObject({ documentNumber: null, canOpen: false })
  })

  it('Riwayat chat hanya pertanyaan milik sendiri, terbaru di atas', async () => {
    const a = await createUser({ role: 'OWNER' })
    const b = await createUser()
    await createDocumentRecord(a, { documentName: 'SOP Sterilisasi Alat' })
    await askDocuments(a, { question: 'sop sterilisasi alat' })
    await askDocuments(a, { question: 'izin yang akan berakhir' })
    await askDocuments(b, { question: 'pertanyaan orang lain' })
    const h = await listAskHistory(a)
    expect(h.map((x) => x.question)).toEqual(['izin yang akan berakhir', 'sop sterilisasi alat'])
    expect(h[0]).toHaveProperty('askedAt')
  })

  it('Umpan balik jawaban tercatat di audit', async () => {
    const a = await createUser()
    await recordAskFeedback(a, { question: 'izin jakarta', helpful: 'yes' })
    await recordAskFeedback(a, { question: 'izin jakarta', helpful: 'no' })
    const ev = await auditActions({ action: 'AI_ANSWER_FEEDBACK' })
    expect(ev.map((e) => e.metadata.helpful).sort()).toEqual([false, true])
    await expect(recordAskFeedback(a, { question: '', helpful: 'yes' })).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})
