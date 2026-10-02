import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { createDocumentRecord } from '@/server/services/documents'
import { getCommandCenter } from '@/server/services/dashboard'
import { requestDocumentAccess } from '@/server/services/access'
import { getAuthorizedDocument } from '@/server/services/files'
import { closeDb, createUser, divisionId, resetDb } from './helpers'

beforeEach(resetDb)
afterAll(closeDb)

const TODAY = '2026-10-02'
const plus = (d: number) => { const x = new Date(`${TODAY}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10) }
let k = 0
const url = () => `https://drive.google.com/file/d/DASHFILE${++k}abcd/view`

async function seed() {
  const owner = await createUser({ role: 'OWNER' })
  const gm = await createUser({ role: 'GM' })
  const pic = await createUser({ name: 'Rina' })
  const staf = await createUser({ name: 'Budi' })
  const legal = await divisionId()
  const d60 = await createDocumentRecord(owner, { documentName: 'SIP dr Sarah', divisionId: legal, picUserId: pic.userId, securityLevel: '2', expiryDate: plus(60), externalUrl: url() })
  await createDocumentRecord(owner, { documentName: 'Sewa Gedung', divisionId: legal, picUserId: pic.userId, securityLevel: '2', expiryDate: plus(120), externalUrl: url() })
  const lewat = await createDocumentRecord(owner, { documentName: 'STR Perawat', divisionId: legal, securityLevel: '2', expiryDate: plus(-5), externalUrl: url() })
  const exec = await createDocumentRecord(owner, { documentName: 'Akta Rahasia', divisionId: legal, securityLevel: '5', expiryDate: plus(30), externalUrl: url() })
  await db()`insert into dev_drive_files (container_id, file_id, name, content) values ('mock-d', 'DASHL3FILE01', 'l3.pdf', ${Buffer.from('%PDF')})`
  const l3 = await createDocumentRecord(owner, { documentName: 'Kontrak Vendor', divisionId: legal, picUserId: pic.userId, securityLevel: '3', externalUrl: 'https://drive.google.com/file/d/DASHL3FILE01/view' })
  await db()`insert into documents (document_name, status, division_id, pic_user_id) values ('draft scan.pdf', 'DRAFT', ${legal}, ${pic.userId}), ('draft lain.pdf', 'DRAFT', ${legal}, null)`
  await requestDocumentAccess(staf, l3.documentId, { reason: 'butuh untuk audit' })
  await getAuthorizedDocument(pic, l3.documentId)
  return { owner, gm, pic, staf, d60, lewat, exec, l3 }
}

describe('Command Center', () => {
  it('Owner: menunggu approval, akan kedaluwarsa (≤90 hari, termasuk lewat), draft, aktivitas, aktivitas terbatas', async () => {
    const s = await seed()
    const c = await getCommandCenter(s.owner, { today: TODAY })
    expect(c.pendingApprovals.length).toBe(1)
    expect(c.expiring.map((d) => d.documentName)).toEqual(['STR Perawat', 'Akta Rahasia', 'SIP dr Sarah'])
    expect(c.expiring.find((d) => d.documentName === 'SIP dr Sarah')!.daysLeft).toBe(60)
    expect(c.totals).toMatchObject({ expiring: 2, expired: 1, activeDocuments: 5 })
    expect(c.draftCount).toBe(2)
    expect(c.recentActivity.length).toBeGreaterThan(0)
    expect(c.restrictedActivity.map((a) => a.action)).toEqual(expect.arrayContaining(['DOCUMENT_OPENED', 'APPROVAL_REQUESTED']))
    expect(c.divisions.find((d) => d.divisionName === 'Legal/Perizinan')!.documentCount).toBe(5)
  })

  it('Dokumen kedaluwarsa 120 hari tidak muncul; GM tidak melihat dokumen L5 di kartu', async () => {
    const s = await seed()
    const c = await getCommandCenter(s.gm, { today: TODAY })
    expect(c.expiring.map((d) => d.documentName)).toEqual(['STR Perawat', 'SIP dr Sarah'])
    expect(c.recentActivity.some((a) => a.documentName === 'Akta Rahasia')).toBe(false)
    expect(c.divisions[0].documentCount).toBe(4)
  })

  it('Division User: hanya item miliknya (PIC) & permintaan aksesnya', async () => {
    const s = await seed()
    const p = await getCommandCenter(s.pic, { today: TODAY })
    expect(p.expiring.map((d) => d.documentName)).toEqual(['SIP dr Sarah'])
    expect(p.drafts.map((d) => d.documentName)).toEqual(['draft scan.pdf'])
    expect(p.pendingApprovals).toEqual([])
    expect(p.recentActivity).toEqual([])
    const b = await getCommandCenter(s.staf, { today: TODAY })
    expect(b.myRequests.map((r) => r.status)).toEqual(['PENDING'])
    expect(b.expiring).toEqual([])
    expect(b.drafts).toEqual([])
  })
})
