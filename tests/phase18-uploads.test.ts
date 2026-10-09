import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDocumentRecord, getDocumentMetadata, listDocuments, updateDocumentMetadata } from '@/server/services/documents'
import { openDocumentFile, openDriveLink, openStoredFile } from '@/server/services/files'
import { prepareDocumentUpload, safeObjectName } from '@/server/services/uploads'
import { mockStorageAdapter, setStorageAdapterForTest } from '@/server/integrations/storage'
import type { IdentityContext } from '@/server/context'
import { auditActions, closeDb, createUser, divisionId, resetDb } from './helpers'

const prev = process.env.DRIVE_PROVIDER
beforeEach(async () => {
  await resetDb()
  process.env.DRIVE_PROVIDER = 'link'
  mockStorageAdapter.reset()
  setStorageAdapterForTest(mockStorageAdapter)
})
afterEach(() => {
  process.env.DRIVE_PROVIDER = prev
  setStorageAdapterForTest(null)
})
afterAll(closeDb)

const PDF = 'application/pdf'

/** Simulasi browser: minta URL unggah lalu "PUT" berkas ke penyimpanan. */
async function upload(ctx: IdentityContext, fileName = 'Izin Operasional 2026.pdf', size = 120_000, mimeType = PDF) {
  const signed = await prepareDocumentUpload(ctx, { fileName, mimeType, size })
  mockStorageAdapter.put(signed.path, { size, mimeType })
  return signed
}

describe('Upload berkas dokumen (Phase 18)', () => {
  it('Dokumen dengan berkas unggahan: tersimpan, terdeteksi sebagai UPLOAD, dibuka lewat CSSE + diaudit', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const up = await upload(owner)
    expect(up.path).toMatch(new RegExp(`^u/${owner.userId}/[0-9a-f-]{36}/Izin_Operasional_2026\\.pdf$`))
    expect(up.uploadUrl).toContain('token=')

    const doc = await createDocumentRecord(owner, {
      documentName: 'Izin Operasional Klinik', securityLevel: '2', divisionId: await divisionId(),
      fileSource: 'upload', uploadPath: up.path, uploadName: 'Izin Operasional 2026.pdf',
    })
    expect(doc).toMatchObject({ fileSource: 'UPLOAD', hasFile: true, fileName: 'Izin Operasional 2026.pdf', fileSize: 120_000, fileMimeType: PDF, openMode: 'CSSE', externalUrl: null })

    const res = await openDocumentFile(owner, doc.documentId)
    expect(res.kind).toBe('redirect')
    expect(res.kind === 'redirect' && res.url).toContain('expires=60')
    const dl = await openDocumentFile(owner, doc.documentId, { download: true })
    expect(dl.kind === 'redirect' && decodeURIComponent(dl.url)).toContain('download=Izin Operasional 2026.pdf')

    const [created] = await auditActions({ action: 'DOCUMENT_CREATED' })
    expect(created.metadata).toMatchObject({ file: { source: 'UPLOAD', size: 120_000, mimeType: PDF } })
    expect((await auditActions({ action: 'DOCUMENT_OPENED' }))[0].metadata).toMatchObject({ via: 'CSSE_STORAGE' })
    expect(await auditActions({ action: 'DOCUMENT_DOWNLOADED' })).toHaveLength(1)
  })

  it('Unggahan L1 tetap dibuka lewat CSSE (bukan tautan Drive), tautan lama /open-drive diarahkan ke penyimpanan', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const up = await upload(owner)
    const doc = await createDocumentRecord(owner, { documentName: 'SOP Umum', securityLevel: '1', fileSource: 'upload', uploadPath: up.path })
    const meta = await getDocumentMetadata(owner, doc.documentId)
    expect(meta.permissions.openMode).toBe('CSSE')
    expect(await openDriveLink(owner, doc.documentId)).toContain('storage.mock/sign/')
  })

  it('User tanpa izin ditolak (tanpa URL), dan nama berkas disembunyikan darinya', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const stafLain = await createUser({ division: 'Keuangan' })
    const stafLegal = await createUser()
    const up = await upload(owner, 'SIP dr Budi.pdf')
    const doc = await createDocumentRecord(owner, { documentName: 'SIP Dokter', securityLevel: '3', divisionId: await divisionId(), fileSource: 'upload', uploadPath: up.path })

    await expect(openStoredFile(stafLain, doc.documentId)).rejects.toMatchObject({ code: expect.stringMatching(/ACCESS_DENIED|NOT_FOUND/) })
    await expect(openStoredFile(stafLegal, doc.documentId)).rejects.toMatchObject({ code: 'ACCESS_DENIED', details: { requestable: true } })
    const seen = (await listDocuments(stafLegal, {})).find((d) => d.documentId === doc.documentId)!
    expect(seen).toMatchObject({ canOpen: false, fileSource: 'UPLOAD', fileName: null, fileSize: null })
    expect((await auditActions({ action: 'ACCESS_DENIED' })).length).toBeGreaterThanOrEqual(1)
  })

  it('Tidak bisa menempelkan unggahan milik user lain, atau path yang belum terunggah', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const gm = await createUser({ role: 'GM' })
    const up = await upload(owner)
    await expect(createDocumentRecord(gm, { documentName: 'Curian', fileSource: 'upload', uploadPath: up.path }))
      .rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('tidak valid') })
    const notYet = await prepareDocumentUpload(gm, { fileName: 'a.pdf', mimeType: PDF, size: 10 })
    await expect(createDocumentRecord(gm, { documentName: 'Belum', fileSource: 'upload', uploadPath: notYet.path }))
      .rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('belum selesai') })
    await expect(createDocumentRecord(owner, { documentName: 'Jahat', fileSource: 'upload', uploadPath: `u/${owner.userId}/../x` }))
      .rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('Satu unggahan hanya untuk satu dokumen', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const up = await upload(owner)
    await createDocumentRecord(owner, { documentName: 'Pertama', fileSource: 'upload', uploadPath: up.path })
    await expect(createDocumentRecord(owner, { documentName: 'Kedua', fileSource: 'upload', uploadPath: up.path })).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('Jenis & ukuran divalidasi saat minta unggah DAN dari data penyimpanan (bukan klaim browser)', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await expect(prepareDocumentUpload(owner, { fileName: 'x.html', mimeType: 'text/html', size: 10 })).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('tidak didukung') })
    await expect(prepareDocumentUpload(owner, { fileName: 'x.pdf', mimeType: PDF, size: 26 * 1024 * 1024 })).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('25 MB') })
    // Browser mengaku PDF, tapi yang tersimpan HTML → ditolak saat simpan.
    const signed = await prepareDocumentUpload(owner, { fileName: 'x.pdf', mimeType: PDF, size: 10 })
    mockStorageAdapter.put(signed.path, { size: 10, mimeType: 'text/html' })
    await expect(createDocumentRecord(owner, { documentName: 'Palsu', fileSource: 'upload', uploadPath: signed.path })).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('Ubah metadata tanpa memilih berkas baru → berkas unggahan dipertahankan; bisa diganti atau pindah ke tautan Drive', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const up = await upload(owner, 'v1.pdf')
    const doc = await createDocumentRecord(owner, { documentName: 'Kontrak Sewa', fileSource: 'upload', uploadPath: up.path })

    const kept = await updateDocumentMetadata(owner, doc.documentId, { documentName: 'Kontrak Sewa Gedung', fileSource: 'upload', externalUrl: '' })
    expect(kept).toMatchObject({ fileSource: 'UPLOAD', fileName: 'v1.pdf', documentName: 'Kontrak Sewa Gedung' })
    // Klien API lama (tanpa fileSource, tanpa externalUrl) juga tidak menghapus berkas.
    expect(await updateDocumentMetadata(owner, doc.documentId, { documentName: 'Kontrak Sewa Gedung' })).toMatchObject({ fileSource: 'UPLOAD' })

    const up2 = await upload(owner, 'v2.pdf', 999)
    const replaced = await updateDocumentMetadata(owner, doc.documentId, { documentName: 'Kontrak Sewa Gedung', fileSource: 'upload', uploadPath: up2.path })
    expect(replaced).toMatchObject({ fileName: 'v2.pdf', fileSize: 999 })

    const toDrive = await updateDocumentMetadata(owner, doc.documentId, { documentName: 'Kontrak Sewa Gedung', fileSource: 'link', externalUrl: 'https://drive.google.com/file/d/1AbcDefGhiJklMnoPq/view' })
    expect(toDrive).toMatchObject({ fileSource: 'DRIVE', fileName: null, openMode: 'DRIVE' })

    const changes = (await auditActions({ action: 'DOCUMENT_UPDATED' })).map((a) => (a.metadata.changes as Record<string, { to: unknown }>).file?.to ?? null)
    expect(changes).toEqual([null, null, 'Unggahan: v2.pdf', 'Tautan Google Drive'])
  })

  it('Berkas hilang di penyimpanan → pesan jelas + ditandai sumber hilang', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const up = await upload(owner)
    const doc = await createDocumentRecord(owner, { documentName: 'Hilang', fileSource: 'upload', uploadPath: up.path })
    mockStorageAdapter.reset()
    await expect(openStoredFile(owner, doc.documentId)).rejects.toMatchObject({ code: 'NOT_FOUND', message: expect.stringContaining('unggah ulang') })
    expect((await getDocumentMetadata(owner, doc.documentId)).flags.sourceMissing).toBe(true)
  })

  it('Tautan Drive tetap bekerja seperti sebelumnya', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const url = 'https://drive.google.com/file/d/1AbcDefGhiJklMnoPq/view'
    const doc = await createDocumentRecord(owner, { documentName: 'Lewat Drive', fileSource: 'link', externalUrl: url })
    expect(doc).toMatchObject({ fileSource: 'DRIVE', openMode: 'DRIVE' })
    expect(await openDocumentFile(owner, doc.documentId)).toEqual({ kind: 'redirect', url })
  })

  it('Nama objek dibersihkan dari karakter berbahaya', () => {
    expect(safeObjectName('../../etc/passwd')).toBe('etc_passwd')
    expect(safeObjectName('Surat Izin (final).PDF')).toBe('Surat_Izin_final_.PDF')
    expect(safeObjectName('...')).toBe('berkas')
  })
})
