import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDocumentRecord, getDocumentMetadata } from '@/server/services/documents'
import { getAuthorizedDocument, openDriveLink } from '@/server/services/files'
import { createDriveSource, driveHealth, scanAllSources } from '@/server/services/sources'
import { parseDriveFileId } from '@/server/integrations/drive/url'
import { auditActions, closeDb, createUser, divisionId, resetDb } from './helpers'

const prev = process.env.DRIVE_PROVIDER
beforeEach(async () => {
  await resetDb()
  process.env.DRIVE_PROVIDER = 'link'
})
afterEach(() => {
  process.env.DRIVE_PROVIDER = prev
})
afterAll(closeDb)

const L3_URL = 'https://drive.google.com/file/d/1AbcDefGhiJklMnoPq/view?usp=sharing'

describe('Mode tautan Drive (DRIVE_PROVIDER=link)', () => {
  it('Tautan folder Drive diterima sebagai lokasi dokumen', () => {
    expect(parseDriveFileId('https://drive.google.com/drive/folders/1FolderIdXyz123')).toBe('1FolderIdXyz123')
    expect(parseDriveFileId('https://drive.google.com/drive/u/0/folders/1FolderIdXyz123?usp=sharing')).toBe('1FolderIdXyz123')
  })

  it('Dokumen L3 dibuka lewat tautan Drive oleh yang berwenang + tercatat di audit', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const doc = await createDocumentRecord(owner, { documentName: 'Kontrak Vendor', securityLevel: '3', externalUrl: L3_URL, divisionId: await divisionId() })
    const meta = await getDocumentMetadata(owner, doc.documentId)
    expect(meta.permissions.openMode).toBe('DRIVE')
    expect(await openDriveLink(owner, doc.documentId)).toBe(L3_URL)
    const [a] = await auditActions({ action: 'DOCUMENT_OPENED' })
    expect(a.metadata).toMatchObject({ securityLevel: 3, via: 'DRIVE_LINK' })
  })

  it('User yang tidak berwenang tetap ditolak CSSE (tautan tidak diberikan)', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const staf = await createUser({ division: 'Keuangan' })
    const doc = await createDocumentRecord(owner, { documentName: 'Kontrak Vendor', securityLevel: '4', externalUrl: L3_URL, divisionId: await divisionId() })
    await expect(openDriveLink(staf, doc.documentId)).rejects.toMatchObject({ code: expect.stringMatching(/ACCESS_DENIED|NOT_FOUND/) })
  })

  it('Proxy file CSSE tidak dipakai di mode tautan', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const doc = await createDocumentRecord(owner, { documentName: 'Kontrak', securityLevel: '3', externalUrl: L3_URL })
    await expect(getAuthorizedDocument(owner, doc.documentId)).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('tautan') })
  })

  it('Sumber Drive & scan dinonaktifkan; status Drive menyatakan mode tautan', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await expect(createDriveSource(owner, { folder: 'https://drive.google.com/drive/folders/1Abc', sourceType: 'STANDARD' })).rejects.toMatchObject({
      code: 'VALIDATION', message: expect.stringContaining('tautan'),
    })
    expect(await scanAllSources()).toEqual([])
    expect(await driveHealth()).toMatchObject({ mode: 'link', authErrors: [] })
  })
})
