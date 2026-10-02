import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDocumentRecord, directoryCounts } from '@/server/services/documents'
import { searchDocuments } from '@/server/services/search'
import { closeDb, createUser, divisionId, resetDb } from './helpers'

beforeEach(resetDb)
afterAll(closeDb)

describe('Direktori Dokumen Divisi', () => {
  it('Jumlah per divisi dihitung dalam scope izin user', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const legal = await divisionId('Legal/Perizinan')
    const keu = await divisionId('Keuangan')
    await createDocumentRecord(owner, { documentName: 'Izin Operasional', securityLevel: '2', divisionId: legal })
    await createDocumentRecord(owner, { documentName: 'SIP Dokter', securityLevel: '1', divisionId: legal })
    await createDocumentRecord(owner, { documentName: 'Laporan Pajak', securityLevel: '2', divisionId: keu })
    const staf = await createUser({ division: 'Legal/Perizinan' })

    const o = await directoryCounts(owner)
    expect(o.total).toBe(3)
    expect(o.byDivision.find((d) => d.divisionId === keu)?.count).toBe(1)

    const s = await directoryCounts(staf)
    expect(s.total).toBe(2) // L2 Keuangan tidak terlihat oleh staf Legal
    expect(s.byDivision.find((d) => d.divisionId === keu)?.count ?? 0).toBe(0)
    expect(s.byDivision.find((d) => d.divisionId === legal)?.count).toBe(2)
  })

  it('Filter tahun (berlaku/berakhir) dan paginasi offset', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await createDocumentRecord(owner, { documentName: 'Kontrak 2025', effectiveDate: '2025-02-01', expiryDate: '2025-12-31' })
    await createDocumentRecord(owner, { documentName: 'Kontrak 2026', effectiveDate: '2026-01-10', expiryDate: '2027-01-10' })
    await createDocumentRecord(owner, { documentName: 'Sewa 2024-2026', effectiveDate: '2024-03-01', expiryDate: '2026-03-01' })
    const y = await searchDocuments(owner, { year: '2026' })
    expect(y.results.map((r) => r.documentName).sort()).toEqual(['Kontrak 2026', 'Sewa 2024-2026'])

    const p1 = await searchDocuments(owner, { limit: 2, offset: 0 })
    const p2 = await searchDocuments(owner, { limit: 2, offset: 2 })
    expect(p1.total).toBe(3)
    expect(p1.results).toHaveLength(2)
    expect(p2.results).toHaveLength(1)
    expect(new Set([...p1.results, ...p2.results].map((r) => r.documentId)).size).toBe(3)
  })

  it('DTO memberi tahu ada berkas & boleh buka tanpa membocorkan tautan', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const staf = await createUser({ division: 'Legal/Perizinan' })
    await createDocumentRecord(owner, { documentName: 'Memo Rahasia', securityLevel: '3', divisionId: await divisionId(), externalUrl: 'https://drive.google.com/file/d/1MemoRahasiaXyz/view' })
    const [r] = (await searchDocuments(staf, {})).results
    expect(r).toMatchObject({ hasFile: true, canOpen: false, externalUrl: null })
    const [o] = (await searchDocuments(owner, {})).results
    expect(o).toMatchObject({ hasFile: true, canOpen: true })
  })
})
