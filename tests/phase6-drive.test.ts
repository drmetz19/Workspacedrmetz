import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { createDriveSource, driveHealth, listDriveSources, scanAllSources, scanSource, setDriveSourceStatus } from '@/server/services/sources'
import { confirmDraft, getDraftForReview, listDraftsForReview, rejectDraft } from '@/server/services/review'
import { createDocumentRecord, getDocumentMetadata, listDocuments } from '@/server/services/documents'
import { searchDocuments } from '@/server/services/search'
import { setMockDriveFailure } from '@/server/integrations/drive/mock'
import { suggestFromFilename } from '@/server/services/suggest'
import { auditActions, closeDb, createUser, divisionId, resetDb } from './helpers'

beforeEach(resetDb)
afterEach(() => setMockDriveFailure(null))
afterAll(closeDb)

async function addFile(container: string, id: string, name: string, text: string | null = null, mime = 'application/pdf') {
  await db()`insert into dev_drive_files (container_id, file_id, name, mime_type, text_content) values (${container}, ${id}, ${name}, ${mime}, ${text})`
}

describe('heuristik nama file', () => {
  it('Kategori, tanggal kedaluwarsa, dan level dari nama file', () => {
    expect(suggestFromFilename({ name: 'Izin_Operasional_Klinik_Jakarta_exp_2027-03-31.pdf', path: '' }, false)).toMatchObject({
      documentName: 'Izin Operasional Klinik Jakarta exp 2027-03-31', categoryName: 'Izin Operasional', expiryDate: '2027-03-31', securityLevel: 2,
    })
    expect(suggestFromFilename({ name: 'PKS Vendor Laser 12-01-2026.docx', path: '' }, true)).toMatchObject({ categoryName: 'Kontrak', effectiveDate: '2026-01-12', securityLevel: 3 })
    expect(suggestFromFilename({ name: 'scan001.jpg', path: 'SIP Dokter' }, false)).toMatchObject({ categoryName: 'SIP' })
  })
})

describe('sumber Drive', () => {
  it('Owner menghubungkan folder (tautan Drive) sebagai STANDARD; status tampil', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const s = await createDriveSource(owner, { folder: 'https://drive.google.com/drive/folders/mock-legal', sourceType: 'STANDARD', defaultDivisionId: await divisionId() })
    expect(s).toMatchObject({ externalId: 'mock-legal', sourceType: 'STANDARD', authStatus: 'OK', defaultDivisionName: 'Legal/Perizinan' })
    expect((await listDriveSources(owner)).length).toBe(1)
    expect((await auditActions({ action: 'DRIVE_SOURCE_CONNECTED' })).length).toBe(1)
    await expect(createDriveSource(owner, { folder: 'mock-legal', sourceType: 'STANDARD' })).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('Folder yang tidak dibagikan ke akun CSSE → pesan jelas', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await expect(createDriveSource(owner, { folder: 'https://drive.google.com/drive/folders/1RealFolderNotShared', sourceType: 'STANDARD' })).rejects.toMatchObject({
      code: 'VALIDATION', message: expect.stringContaining('Bagikan folder ke'),
    })
  })

  it('Folder terbatas yang masih dibagikan ke orang lain dicatat untuk peringatan', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await addFile('x', '__SHARED__mock-rahasia', 'staf@klinik.id,SIAPA SAJA DENGAN LINK')
    const s = await createDriveSource(owner, { folder: 'mock-rahasia', sourceType: 'RESTRICTED' })
    expect(s.sharedWith).toEqual(['staf@klinik.id', 'SIAPA SAJA DENGAN LINK'])
  })

  it('Hanya Owner yang bisa menghubungkan; GM boleh melihat daftar & scan; staf tidak', async () => {
    const gm = await createUser({ role: 'GM' })
    const staf = await createUser()
    await expect(createDriveSource(gm, { folder: 'mock-x', sourceType: 'STANDARD' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    await expect(listDriveSources(gm)).resolves.toEqual([])
    await expect(listDriveSources(staf)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })
})

describe('scan', () => {
  async function setup() {
    const owner = await createUser({ role: 'OWNER' })
    const legal = await divisionId()
    await addFile('mock-legal', 'F1', 'Izin_Operasional_Klinik_Jakarta_exp_2027-03-31.pdf')
    await addFile('mock-legal', 'F2', 'MoU RS Mitra.pdf')
    await addFile('mock-legal', 'F3', 'SIP dr Sarah.pdf')
    await addFile('mock-rahasia', 'R1', 'Kontrak Vendor Laser.pdf')
    const std = await createDriveSource(owner, { folder: 'mock-legal', sourceType: 'STANDARD', defaultDivisionId: legal })
    const res = await createDriveSource(owner, { folder: 'mock-rahasia', sourceType: 'RESTRICTED', defaultDivisionId: legal })
    return { owner, legal, std, res }
  }

  it('Scan pertama membuat N draft untuk N file; scan kedua tanpa perubahan 0 draft baru', async () => {
    const { owner, std } = await setup()
    expect(await scanSource(owner, std.sourceId)).toMatchObject({ found: 3, created: 3, skipped: 0 })
    expect(await scanSource(owner, std.sourceId)).toMatchObject({ found: 3, created: 0, skipped: 3 })
    const drafts = await listDraftsForReview(owner)
    expect(drafts.length).toBe(3)
    const izin = drafts.find((d) => d.externalResourceId === 'F1')!
    expect(izin.suggested).toMatchObject({ categoryName: 'Izin Operasional', expiryDate: '2027-03-31' })
    expect(izin.expiryDate).toBeNull() // saran tidak langsung menjadi field final
    expect((await auditActions({ action: 'DRIVE_SCAN_COMPLETED' })).length).toBe(2)
  })

  it('File di folder RESTRICTED → draft level default ≥ L3', async () => {
    const { owner, res } = await setup()
    await scanSource(owner, res.sourceId)
    const [d] = await listDraftsForReview(owner)
    expect(d.securityLevel).toBeGreaterThanOrEqual(3)
    expect(d.restrictedSource).toBe(true)
  })

  it('Draft tidak muncul di daftar/pencarian sampai dikonfirmasi; konfirmasi → ACTIVE + audit', async () => {
    const { owner, std } = await setup()
    await scanSource(owner, std.sourceId)
    expect((await listDocuments(owner, {})).length).toBe(0)
    expect((await searchDocuments(owner, { q: 'izin' })).results.length).toBe(0)
    const d = (await listDraftsForReview(owner)).find((x) => x.externalResourceId === 'F1')!
    const cat = (await db()<{ category_id: string }[]>`select category_id from categories where category_name = 'Izin Operasional'`)[0].category_id
    await confirmDraft(owner, d.documentId, { documentName: 'Izin Operasional Klinik Jakarta', categoryId: cat, securityLevel: '2', expiryDate: '2027-03-31' })
    expect((await searchDocuments(owner, { q: 'izin' })).results.map((r) => r.documentName)).toEqual(['Izin Operasional Klinik Jakarta'])
    expect((await auditActions({ action: 'DOCUMENT_CONFIRMED' })).length).toBe(1)
    await expect(confirmDraft(owner, d.documentId, { documentName: 'Lagi' })).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('Draft dari folder terbatas tidak bisa dikonfirmasi di bawah L3', async () => {
    const { owner, res } = await setup()
    await scanSource(owner, res.sourceId)
    const [d] = await listDraftsForReview(owner)
    await expect(confirmDraft(owner, d.documentId, { documentName: 'Kontrak Vendor', securityLevel: '2' })).rejects.toMatchObject({ code: 'VALIDATION' })
    await confirmDraft(owner, d.documentId, { documentName: 'Kontrak Vendor', securityLevel: '4' })
  })

  it('Tolak draft → REJECTED; scan ulang tidak membuatnya lagi', async () => {
    const { owner, std } = await setup()
    await scanSource(owner, std.sourceId)
    const d = (await listDraftsForReview(owner))[0]
    await rejectDraft(owner, d.documentId, 'bukan dokumen legal')
    expect((await listDraftsForReview(owner)).length).toBe(2)
    expect(await scanSource(owner, std.sourceId)).toMatchObject({ created: 0 })
    expect((await auditActions({ action: 'DOCUMENT_REJECTED' }))[0].metadata).toMatchObject({ note: 'bukan dokumen legal' })
  })

  it('File dihapus dari Drive → SOURCE_MISSING (record tetap); muncul lagi → pulih', async () => {
    const { owner, std } = await setup()
    await scanSource(owner, std.sourceId)
    await db()`update dev_drive_files set trashed = true where file_id = 'F2'`
    expect(await scanSource(owner, std.sourceId)).toMatchObject({ missing: 1 })
    const [doc] = await db()<{ document_id: string; flag_source_missing: boolean }[]>`select document_id, flag_source_missing from documents where external_resource_id = 'F2'`
    expect(doc.flag_source_missing).toBe(true)
    expect((await getDocumentMetadata(owner, doc.document_id)).flags.sourceMissing).toBe(true)
    expect(await scanSource(owner, std.sourceId)).toMatchObject({ missing: 0 })
    await db()`update dev_drive_files set trashed = false where file_id = 'F2'`
    expect(await scanSource(owner, std.sourceId)).toMatchObject({ restored: 1 })
  })

  it('Dokumen manual dengan file yang sama tidak diduplikasi, tapi ditautkan ke sumber', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await addFile('mock-legal', 'F9', 'Sewa Gedung.pdf')
    await createDocumentRecord(owner, { documentName: 'Sewa Gedung', externalUrl: 'https://drive.google.com/file/d/F9/view' })
    const s = await createDriveSource(owner, { folder: 'mock-legal', sourceType: 'STANDARD' })
    expect(await scanSource(owner, s.sourceId)).toMatchObject({ created: 0, linked: 1 })
  })

  it('Otorisasi Drive dicabut → scan gagal, auth_status ERROR, terlihat di driveHealth', async () => {
    const { owner, std } = await setup()
    setMockDriveFailure('AUTH')
    await expect(scanSource(owner, std.sourceId)).rejects.toMatchObject({ code: 'UNAVAILABLE' })
    const h = await driveHealth()
    expect(h.connected).toBe(false)
    expect(h.authErrors.length).toBe(1)
    expect((await auditActions({ action: 'DRIVE_SCAN_FAILED' })).length).toBe(1)
    setMockDriveFailure(null)
    await scanSource(owner, std.sourceId)
    expect((await driveHealth()).connected).toBe(true)
  })

  it('Cron scanAllSources memproses semua sumber aktif, melewati yang dinonaktifkan', async () => {
    const { owner, res } = await setup()
    await setDriveSourceStatus(owner, res.sourceId, 'DISABLED')
    const results = await scanAllSources()
    expect(results.length).toBe(1)
    expect(results[0]).toMatchObject({ ok: true, stats: { created: 3 } })
    const [a] = await db()`select source from audit_events where action = 'DRIVE_SCAN_COMPLETED'`
    expect(a.source).toBe('SYSTEM')
  })

  it('Division User tidak melihat antrean draft; review detail menampilkan saran', async () => {
    const { owner, std } = await setup()
    const staf = await createUser()
    await scanSource(owner, std.sourceId)
    expect(await listDraftsForReview(staf)).toEqual([])
    const d = (await listDraftsForReview(owner))[0]
    await expect(getDraftForReview(staf, d.documentId)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    expect((await getDraftForReview(owner, d.documentId)).suggestions[0].source).toBe('HEURISTIC')
  })
})
