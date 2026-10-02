import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import {
  archiveDocument,
  createDocumentRecord,
  getDocumentHistory,
  getDocumentMetadata,
  listDocuments,
  supersedeDocument,
  updateDocumentMetadata,
} from '@/server/services/documents'
import { auditActions, closeDb, createUser, divisionId, resetDb } from './helpers'

beforeEach(resetDb)
afterAll(closeDb)

async function categoryId(name = 'Izin Operasional') {
  const [r] = await db()<{ category_id: string }[]>`select category_id from categories where category_name = ${name}`
  return r.category_id
}

async function baseInput(over: Record<string, unknown> = {}) {
  return {
    documentName: 'Izin Operasional Klinik Jakarta',
    documentNumber: '503/IO/2025',
    categoryId: await categoryId(),
    divisionId: await divisionId(),
    securityLevel: '2',
    externalUrl: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing',
    effectiveDate: '2025-01-10',
    expiryDate: '2030-01-10',
    ...over,
  }
}

describe('registry', () => {
  it('Membuat record: document_id internal, Drive file ID diekstrak dari URL, audit DOCUMENT_CREATED', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const pic = await createUser()
    const doc = await createDocumentRecord(owner, await baseInput({ picUserId: pic.userId }))
    expect(doc.documentId).toMatch(/^[0-9a-f-]{36}$/)
    expect(doc.externalResourceId).toBe('1AbCdEfGhIjKlMnOp')
    expect(doc.status).toBe('ACTIVE')
    expect(doc.version).toBe(1)
    expect(doc.picUserId).toBe(pic.userId)
    const [a] = await auditActions({ action: 'DOCUMENT_CREATED' })
    expect(a.resource_id).toBe(doc.documentId)
  })

  it('Drive file ID yang sama ditolak (CONFLICT), apa pun bentuk URL-nya', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await createDocumentRecord(owner, await baseInput())
    await expect(
      createDocumentRecord(owner, await baseInput({ documentName: 'Lain', externalUrl: 'https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp' })),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('Validasi: nama wajib, tanggal kedaluwarsa ≥ berlaku, URL harus https', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await expect(createDocumentRecord(owner, await baseInput({ documentName: '' }))).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(createDocumentRecord(owner, await baseInput({ expiryDate: '2020-01-01' }))).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(createDocumentRecord(owner, await baseInput({ externalUrl: 'javascript:alert(1)' }))).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('Detail menampilkan metadata lengkap dengan nama kategori, divisi, PIC', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const pic = await createUser({ name: 'Rina' })
    const doc = await createDocumentRecord(owner, await baseInput({ picUserId: pic.userId }))
    const d = await getDocumentMetadata(owner, doc.documentId)
    expect(d.categoryName).toBe('Izin Operasional')
    expect(d.divisionName).toBe('Legal/Perizinan')
    expect(d.picName).toBe('Rina')
    expect(d.expiryDate).toBe('2030-01-10')
  })

  it('Edit metadata tercatat dengan before/after; riwayat dokumen bisa dibaca', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const doc = await createDocumentRecord(owner, await baseInput())
    await updateDocumentMetadata(owner, doc.documentId, { ...(await baseInput()), documentNumber: '503/IO/2025-REV' })
    const [a] = await auditActions({ action: 'DOCUMENT_UPDATED' })
    expect(a.metadata).toMatchObject({ changes: { documentNumber: { from: '503/IO/2025', to: '503/IO/2025-REV' } } })
    const hist = await getDocumentHistory(owner, doc.documentId)
    expect(hist.map((h) => h.action)).toEqual(['DOCUMENT_UPDATED', 'DOCUMENT_CREATED'])
  })

  it('Arsip: dokumen keluar dari daftar aktif tapi tetap ada; audit DOCUMENT_ARCHIVED', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const doc = await createDocumentRecord(owner, await baseInput())
    await archiveDocument(owner, doc.documentId)
    expect((await listDocuments(owner, {})).map((d) => d.documentId)).not.toContain(doc.documentId)
    expect((await listDocuments(owner, { status: 'INACTIVE' })).map((d) => d.documentId)).toContain(doc.documentId)
    expect((await getDocumentMetadata(owner, doc.documentId)).status).toBe('ARCHIVED')
    expect((await auditActions({ action: 'DOCUMENT_ARCHIVED' })).length).toBe(1)
  })

  it('Hanya Owner yang bisa mengarsipkan', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const gm = await createUser({ role: 'GM' })
    const doc = await createDocumentRecord(owner, await baseInput())
    await expect(archiveDocument(gm, doc.documentId)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })
})

describe('versi', () => {
  it('Dokumen baru menggantikan yang lama: lama → SUPERSEDED, versi naik, saling tertaut', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const old = await createDocumentRecord(owner, await baseInput())
    const neu = await createDocumentRecord(owner, await baseInput({ externalUrl: 'https://drive.google.com/file/d/2NewFileId123/view', expiryDate: '2035-01-10' }))
    await supersedeDocument(owner, neu.documentId, old.documentId)
    const o = await getDocumentMetadata(owner, old.documentId)
    const n = await getDocumentMetadata(owner, neu.documentId)
    expect(o.status).toBe('SUPERSEDED')
    expect(o.supersededBy?.documentId).toBe(neu.documentId)
    expect(n.supersedes?.documentId).toBe(old.documentId)
    expect(n.version).toBe(2)
    expect((await listDocuments(owner, {})).map((d) => d.documentId)).toEqual([neu.documentId])
    expect((await auditActions({ action: 'DOCUMENT_SUPERSEDED' })).length).toBe(1)
  })

  it('Bisa langsung menggantikan saat membuat record', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const old = await createDocumentRecord(owner, await baseInput())
    const neu = await createDocumentRecord(owner, await baseInput({ externalUrl: 'https://drive.google.com/file/d/3Abc/view', supersedesDocumentId: old.documentId }))
    expect(neu.version).toBe(2)
    expect((await getDocumentMetadata(owner, old.documentId)).status).toBe('SUPERSEDED')
  })

  it('Tidak bisa menggantikan dokumen yang sudah digantikan atau dirinya sendiri', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const a = await createDocumentRecord(owner, await baseInput())
    const b = await createDocumentRecord(owner, await baseInput({ externalUrl: 'https://drive.google.com/file/d/Bbb/view' }))
    const c = await createDocumentRecord(owner, await baseInput({ externalUrl: 'https://drive.google.com/file/d/Ccc/view' }))
    await supersedeDocument(owner, b.documentId, a.documentId)
    await expect(supersedeDocument(owner, c.documentId, a.documentId)).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(supersedeDocument(owner, c.documentId, c.documentId)).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})

describe('akses sederhana (sebelum engine penuh fase 4)', () => {
  it('Division User hanya melihat dokumen divisinya; PIC bisa edit, staf lain tidak', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const pic = await createUser()
    const other = await createUser()
    const fin = await createUser({ division: 'Finance' })
    const doc = await createDocumentRecord(owner, await baseInput({ picUserId: pic.userId }))
    expect((await listDocuments(fin, {})).length).toBe(0)
    await expect(getDocumentMetadata(fin, doc.documentId)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    await updateDocumentMetadata(pic, doc.documentId, { ...(await baseInput()), picUserId: pic.userId, documentNumber: 'X' })
    await expect(updateDocumentMetadata(other, doc.documentId, await baseInput())).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })

  it('Division User tidak bisa membuat dokumen untuk divisi lain', async () => {
    const staf = await createUser()
    await expect(createDocumentRecord(staf, await baseInput({ divisionId: await divisionId('Finance') }))).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })

  it('ID tidak valid → NOT_FOUND', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await expect(getDocumentMetadata(owner, 'bukan-uuid')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
