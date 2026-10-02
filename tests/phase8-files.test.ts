import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { createDocumentRecord } from '@/server/services/documents'
import { getAuthorizedDocument } from '@/server/services/files'
import { grantDocumentPermission } from '@/server/services/permissions'
import { setMockDriveFailure } from '@/server/integrations/drive/mock'
import { auditActions, closeDb, createUser, divisionId, resetDb } from './helpers'

beforeEach(resetDb)
afterEach(() => setMockDriveFailure(null))
afterAll(closeDb)

async function setup() {
  const owner = await createUser({ role: 'OWNER' })
  const gm = await createUser({ role: 'GM' })
  const pic = await createUser()
  const staf = await createUser()
  const legal = await divisionId()
  await db()`insert into dev_drive_files (container_id, file_id, name, mime_type, content) values
    ('mock-terbatas', 'RESTRICTEDPDF1', 'Kontrak Laser.pdf', 'application/pdf', ${Buffer.from('%PDF-1.4 kontrak')}),
    ('mock-terbatas', 'NATIVEDOC0001', 'Memo Direksi', 'application/vnd.google-apps.document', null),
    ('mock-terbatas', 'HTMLFILE00001', 'halaman.html', 'text/html', ${Buffer.from('<script>alert(1)</script>')})`
  const mk = (name: string, fileId: string, level: string) =>
    createDocumentRecord(owner, { documentName: name, securityLevel: level, divisionId: legal, picUserId: pic.userId, externalUrl: `https://drive.google.com/file/d/${fileId}/view` })
  const kontrak = await mk('Kontrak Laser', 'RESTRICTEDPDF1', '4')
  const memo = await mk('Memo Direksi', 'NATIVEDOC0001', '3')
  const html = await mk('Halaman', 'HTMLFILE00001', '3')
  return { owner, gm, pic, staf, kontrak, memo, html }
}

describe('get_authorized_document', () => {
  it('Owner & PIC membuka file L4 lewat CSSE (tanpa akses Drive) + audit DOCUMENT_OPENED', async () => {
    const s = await setup()
    const f = await getAuthorizedDocument(s.pic, s.kontrak.documentId)
    expect(Buffer.from(f.data).toString()).toBe('%PDF-1.4 kontrak')
    expect(f).toMatchObject({ mimeType: 'application/pdf', disposition: 'inline' })
    await getAuthorizedDocument(s.owner, s.kontrak.documentId, { download: true })
    expect((await auditActions({ action: 'DOCUMENT_OPENED' }))[0]).toMatchObject({ result: 'SUCCESS', resource_id: s.kontrak.documentId })
    expect((await auditActions({ action: 'DOCUMENT_DOWNLOADED' })).length).toBe(1)
  })

  it('User tanpa hak → ACCESS_DENIED (GM pada L4, staf pada L3); tidak ada bypass via ID', async () => {
    const s = await setup()
    await expect(getAuthorizedDocument(s.gm, s.kontrak.documentId)).rejects.toMatchObject({ code: 'ACCESS_DENIED', details: { requestable: true } })
    await expect(getAuthorizedDocument(s.staf, s.memo.documentId)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    await expect(getAuthorizedDocument(s.staf, '00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await auditActions({ action: 'ACCESS_DENIED' })).length).toBe(2)
  })

  it('Grant OPEN eksplisit membuka akses lewat proxy', async () => {
    const s = await setup()
    await grantDocumentPermission(s.owner, s.kontrak.documentId, { principalType: 'USER', principalId: s.gm.userId, permissionType: 'OPEN' })
    await expect(getAuthorizedDocument(s.gm, s.kontrak.documentId)).resolves.toMatchObject({ mimeType: 'application/pdf' })
  })

  it('Dokumen Google native tersaji sebagai PDF', async () => {
    const s = await setup()
    const f = await getAuthorizedDocument(s.owner, s.memo.documentId)
    expect(f).toMatchObject({ mimeType: 'application/pdf', fileName: 'Memo Direksi.pdf' })
  })

  it('Tipe tidak aman (HTML) selalu diunduh, tidak ditampilkan inline', async () => {
    const s = await setup()
    expect((await getAuthorizedDocument(s.owner, s.html.documentId)).disposition).toBe('attachment')
  })

  it('Drive tidak terjangkau → UNAVAILABLE dengan pesan jelas; file hilang → NOT_FOUND + flag', async () => {
    const s = await setup()
    setMockDriveFailure('UNAVAILABLE')
    await expect(getAuthorizedDocument(s.owner, s.kontrak.documentId)).rejects.toMatchObject({ code: 'UNAVAILABLE', message: expect.stringContaining('Metadata tetap bisa dilihat') })
    setMockDriveFailure(null)
    await db()`update dev_drive_files set trashed = true where file_id = 'RESTRICTEDPDF1'`
    await expect(getAuthorizedDocument(s.owner, s.kontrak.documentId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const [d] = await db()`select flag_source_missing from documents where document_id = ${s.kontrak.documentId}`
    expect(d.flag_source_missing).toBe(true)
  })
})
