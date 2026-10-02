import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { createDocumentRecord, supersedeDocument } from '@/server/services/documents'
import { searchDocuments } from '@/server/services/search'
import { closeDb, createUser, divisionId, resetDb } from './helpers'

beforeEach(resetDb)
afterAll(closeDb)

const cat = async (name: string) => (await db()<{ category_id: string }[]>`select category_id from categories where category_name = ${name}`)[0].category_id
let n = 0
const url = () => `https://drive.google.com/file/d/SEARCHFILE${++n}abc/view`

async function seed() {
  const owner = await createUser({ role: 'OWNER' })
  const pic = await createUser({ name: 'Rina' })
  const staf = await createUser({ name: 'Staf Legal' })
  const hr = await createUser({ name: 'HR', division: 'HR' })
  const legal = await divisionId()
  const hrDiv = await divisionId('HR')
  const izinJkt = await createDocumentRecord(owner, { documentName: 'Izin Operasional Klinik Jakarta 2024', categoryId: await cat('Izin Operasional'), divisionId: legal, picUserId: pic.userId, securityLevel: '2', expiryDate: '2026-11-15', externalUrl: url() })
  const izinJkt2 = await createDocumentRecord(owner, { documentName: 'Izin Operasional Klinik Jakarta 2026', categoryId: await cat('Izin Operasional'), divisionId: legal, picUserId: pic.userId, securityLevel: '2', expiryDate: '2031-01-01', externalUrl: url() })
  await supersedeDocument(owner, izinJkt2.documentId, izinJkt.documentId)
  const izinSby = await createDocumentRecord(owner, { documentName: 'Izin Operasional Klinik Surabaya', categoryId: await cat('Izin Operasional'), divisionId: legal, securityLevel: '2', expiryDate: '2026-10-20', externalUrl: url() })
  const kontrak = await createDocumentRecord(owner, { documentName: 'Kontrak Vendor Laser', documentNumber: 'PKS-77', categoryId: await cat('Kontrak'), divisionId: legal, picUserId: pic.userId, securityLevel: '3', confirmedSummary: 'Penalti keterlambatan 5% per minggu', externalUrl: url() })
  const exec = await createDocumentRecord(owner, { documentName: 'Laporan Keuangan Eksekutif Jakarta', categoryId: await cat('Lainnya'), divisionId: hrDiv, securityLevel: '5', externalUrl: url() })
  const sop = await createDocumentRecord(owner, { documentName: 'SOP Umum Klinik', categoryId: await cat('Lainnya'), divisionId: hrDiv, securityLevel: '1', externalUrl: url() })
  return { owner, pic, staf, hr, legal, hrDiv, izinJkt, izinJkt2, izinSby, kontrak, exec, sop }
}

describe('search_documents', () => {
  it('Keyword + filter gabungan (kategori + divisi + level)', async () => {
    const s = await seed()
    const r = await searchDocuments(s.owner, { q: 'izin jakarta', categoryId: await cat('Izin Operasional'), divisionId: s.legal, securityLevel: ['2'], status: 'ALL' })
    expect(r.permissionScopeApplied).toBe(true)
    expect(r.results.map((d) => d.documentName)).toEqual(['Izin Operasional Klinik Jakarta 2026', 'Izin Operasional Klinik Jakarta 2024'])
  })

  it('Versi aktif di atas, versi lama berlabel tidak berlaku', async () => {
    const s = await seed()
    const r = await searchDocuments(s.owner, { q: 'jakarta 202', status: 'ALL' })
    expect(r.results[0].documentId).toBe(s.izinJkt2.documentId)
    expect(r.results[1]).toMatchObject({ documentId: s.izinJkt.documentId, status: 'SUPERSEDED', supersededByDocumentId: s.izinJkt2.documentId })
  })

  it('Default hanya dokumen aktif', async () => {
    const s = await seed()
    const r = await searchDocuments(s.owner, { q: 'izin' })
    expect(r.results.map((d) => d.documentId)).not.toContain(s.izinJkt.documentId)
  })

  it('Filter PIC dan filter kedaluwarsa (≤ N hari / sudah lewat / rentang)', async () => {
    const s = await seed()
    expect((await searchDocuments(s.owner, { picUserId: s.pic.userId })).results.length).toBe(2)
    const soon = await searchDocuments(s.owner, { expiry: 'within90', today: '2026-10-02' })
    expect(soon.results.map((d) => d.documentName).sort()).toEqual(['Izin Operasional Klinik Surabaya'])
    const expired = await searchDocuments(s.owner, { expiry: 'expired', today: '2026-10-25' })
    expect(expired.results.map((d) => d.documentName)).toEqual(['Izin Operasional Klinik Surabaya'])
    const range = await searchDocuments(s.owner, { expiryFrom: '2026-01-01', expiryTo: '2026-12-31', status: 'ALL' })
    expect(range.results.length).toBe(2)
    const none = await searchDocuments(s.owner, { expiry: 'none' })
    expect(none.results.length).toBe(3)
  })

  it('Hasil tidak pernah memuat dokumen di luar scope (dua user, query sama)', async () => {
    const s = await seed()
    const asOwner = await searchDocuments(s.owner, { q: 'jakarta' })
    const asHr = await searchDocuments(s.hr, { q: 'jakarta' })
    expect(asOwner.results.map((d) => d.documentName)).toContain('Laporan Keuangan Eksekutif Jakarta')
    expect(asHr.results).toEqual([])
    expect(asHr.permissionScopeApplied).toBe(true)
  })

  it('Keyword tidak mencocokkan ringkasan/nomor dokumen yang belum boleh dibuka (anti bocor isi)', async () => {
    const s = await seed()
    expect((await searchDocuments(s.pic, { q: 'penalti' })).results.map((d) => d.documentName)).toEqual(['Kontrak Vendor Laser'])
    expect((await searchDocuments(s.staf, { q: 'penalti' })).results).toEqual([])
    expect((await searchDocuments(s.staf, { q: 'PKS-77' })).results).toEqual([])
    expect((await searchDocuments(s.staf, { q: 'kontrak vendor' })).results.length).toBe(1)
  })

  it('Pencarian juga mencocokkan nama PIC dan kategori', async () => {
    const s = await seed()
    expect((await searchDocuments(s.owner, { q: 'rina' })).results.length).toBe(2)
    expect((await searchDocuments(s.owner, { q: 'kontrak' })).results.map((d) => d.documentName)).toEqual(['Kontrak Vendor Laser'])
  })

  it('Input filter tidak valid ditolak', async () => {
    const s = await seed()
    await expect(searchDocuments(s.owner, { securityLevel: ['9'] })).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(searchDocuments(s.owner, { expiryFrom: '02-10-2026' })).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})
