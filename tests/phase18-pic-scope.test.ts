import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { createDocumentRecord, getDocumentMetadata, listUserOptions, updateDocumentMetadata } from '@/server/services/documents'
import { closeDb, createUser, divisionId, resetDb } from './helpers'

beforeEach(resetDb)
afterAll(closeDb)

async function input(over: Record<string, unknown> = {}) {
  return {
    documentName: 'SIP dokter uji',
    divisionId: await divisionId('Legal/Perizinan'),
    securityLevel: '2',
    externalUrl: `https://drive.google.com/file/d/PIC${Math.random().toString(36).slice(2, 10)}/view`,
    ...over,
  }
}

describe('Fase 18 — PIC wajib dari divisi dokumen', () => {
  it('Division User tidak bisa memasang PIC dari divisi lain (create)', async () => {
    const legal = await createUser({ division: 'Legal/Perizinan' })
    const hrd = await createUser({ division: 'HRD' })
    await expect(createDocumentRecord(legal, await input({ picUserId: hrd.userId }))).rejects.toMatchObject({ code: 'VALIDATION' })
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from documents`
    expect(n).toBe(0)
  })

  it('Division User boleh PIC rekan divisi atau Owner/GM', async () => {
    const legal = await createUser({ division: 'Legal/Perizinan' })
    const rekan = await createUser({ division: 'Legal/Perizinan' })
    const gm = await createUser({ role: 'GM', division: null })
    const a = await createDocumentRecord(legal, await input({ picUserId: rekan.userId }))
    const b = await createDocumentRecord(legal, await input({ picUserId: gm.userId }))
    expect(a.picUserId).toBe(rekan.userId)
    expect(b.picUserId).toBe(gm.userId)
  })

  it('Owner tetap bebas memilih PIC lintas divisi', async () => {
    const owner = await createUser({ role: 'OWNER', division: null })
    const hrd = await createUser({ division: 'HRD' })
    const doc = await createDocumentRecord(owner, await input({ picUserId: hrd.userId }))
    expect(doc.picUserId).toBe(hrd.userId)
  })

  it('Update: mengganti PIC ke divisi lain ditolak; edit lain pada dokumen lama tetap bisa', async () => {
    const owner = await createUser({ role: 'OWNER', division: null })
    const legal = await createUser({ division: 'Legal/Perizinan' })
    const hrd = await createUser({ division: 'HRD' })
    // Dokumen lama dengan PIC lintas divisi: edit tanpa mengubah PIC tetap boleh.
    const base = await input({ picUserId: hrd.userId, securityLevel: '1' })
    const doc = await createDocumentRecord(owner, base)
    await expect(getDocumentMetadata(legal, doc.documentId)).resolves.toBeTruthy()
    const renamed = await updateDocumentMetadata(owner, doc.documentId, { ...base, documentName: 'Nama baru' })
    expect(renamed.documentName).toBe('Nama baru')
    // Dokumen milik staf Legal: ganti PIC ke HRD ditolak.
    const own = await input()
    const mine = await createDocumentRecord(legal, own)
    await expect(updateDocumentMetadata(legal, mine.documentId, { ...own, picUserId: hrd.userId })).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('Pilihan PIC untuk Division User hanya rekan divisi + Owner/GM', async () => {
    const legal = await createUser({ division: 'Legal/Perizinan', name: 'Legal A' })
    await createUser({ division: 'Legal/Perizinan', name: 'Legal B' })
    await createUser({ division: 'HRD', name: 'HRD A' })
    await createUser({ role: 'OWNER', division: null, name: 'Owner' })
    const owner = await createUser({ role: 'OWNER', division: null, name: 'Owner 2' })
    const forStaff = (await listUserOptions(legal)).map((u) => u.name).sort()
    expect(forStaff).toEqual(['Legal A', 'Legal B', 'Owner', 'Owner 2'])
    expect((await listUserOptions(owner)).map((u) => u.name)).toContain('HRD A')
  })
})
