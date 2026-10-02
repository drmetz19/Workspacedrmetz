import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, withUserScope } from '@/server/db'
import { createDocumentRecord } from '@/server/services/documents'
import { getAuditHistory, toCsv } from '@/server/services/audit-log'
import { getAuthorizedDocument, openDriveLink } from '@/server/services/files'
import { searchDocuments } from '@/server/services/search'
import { setMockDriveFailure } from '@/server/integrations/drive/mock'
import { loginWithPassword } from '@/server/services/auth'
import { closeDb, createUser, divisionId, resetDb } from './helpers'

beforeEach(resetDb)
afterEach(() => setMockDriveFailure(null))
afterAll(closeDb)

async function seed() {
  const owner = await createUser({ role: 'OWNER' })
  const staf = await createUser({ email: 'staf@drmetz.test', password: 'rahasia-123' })
  const legal = await divisionId()
  const doc = await createDocumentRecord(owner, { documentName: 'Izin Klinik', securityLevel: '2', divisionId: legal, externalUrl: 'https://drive.google.com/file/d/AUDITFILE001/view' })
  await loginWithPassword('staf@drmetz.test', 'rahasia-123')
  await loginWithPassword('staf@drmetz.test', 'salah').catch(() => null)
  await openDriveLink(staf, doc.documentId)
  return { owner, staf, doc }
}

describe('audit viewer', () => {
  it('Filter user / dokumen / aksi / tanggal / hasil', async () => {
    const s = await seed()
    expect((await getAuditHistory(s.owner, { actorUserId: s.staf.userId })).events.map((e) => e.action).sort()).toEqual(['DOCUMENT_OPENED', 'LOGIN_FAILED', 'LOGIN_SUCCEEDED'])
    expect((await getAuditHistory(s.owner, { documentId: s.doc.documentId })).events.map((e) => e.action).sort()).toEqual(['DOCUMENT_CREATED', 'DOCUMENT_OPENED'])
    expect((await getAuditHistory(s.owner, { action: 'LOGIN_FAILED' })).events.length).toBe(1)
    expect((await getAuditHistory(s.owner, { result: 'FAILED' })).events.length).toBe(1)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
    expect((await getAuditHistory(s.owner, { from: today, to: today })).events.length).toBe(4)
    expect((await getAuditHistory(s.owner, { to: '2020-01-01' })).events.length).toBe(0)
    const e = (await getAuditHistory(s.owner, { documentId: s.doc.documentId, action: 'DOCUMENT_OPENED' })).events[0]
    expect(e).toMatchObject({ actorEmail: 'staf@drmetz.test', resourceLabel: 'Izin Klinik', metadata: { via: 'DRIVE_LINK' } })
  })

  it('Paginasi dengan cursor "before"', async () => {
    const s = await seed()
    const p1 = await getAuditHistory(s.owner, { limit: 2 })
    expect(p1.events.length).toBe(2)
    const p2 = await getAuditHistory(s.owner, { limit: 2, before: p1.nextBefore })
    expect(p2.events[0].eventId).not.toBe(p1.events[0].eventId)
  })

  it('Hanya Owner yang bisa melihat audit', async () => {
    const s = await seed()
    await expect(getAuditHistory(s.staf, {})).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })

  it('Audit tidak bisa diubah/dihapus: koneksi sistem (trigger) maupun sesi user (privilege + RLS)', async () => {
    const s = await seed()
    await expect(db()`update audit_events set result = 'SUCCESS'`).rejects.toThrow(/append-only/)
    await expect(db()`delete from audit_events`).rejects.toThrow(/append-only/)
    await expect(db()`truncate audit_events`).rejects.toThrow(/append-only/)
    await expect(withUserScope(s.owner.userId, (tx) => tx`update audit_events set result = 'X'`)).rejects.toThrow()
    await expect(withUserScope(s.staf.userId, (tx) => tx`delete from audit_events`)).rejects.toThrow()
    const mine = await withUserScope(s.staf.userId, (tx) => tx<{ actor_user_id: string }[]>`select actor_user_id from audit_events`)
    expect(mine.every((r) => r.actor_user_id === s.staf.userId)).toBe(true)
    await expect(withUserScope(s.staf.userId, (tx) => tx`insert into audit_events (actor_user_id, action, result) values (${s.owner.userId}, 'PALSU', 'SUCCESS')`)).rejects.toThrow()
  })

  it('Ekspor CSV', async () => {
    const s = await seed()
    const csv = toCsv((await getAuditHistory(s.owner, {})).events)
    expect(csv.split('\n')[0]).toContain('waktu_utc,aksi,hasil')
    expect(csv).toContain('DOCUMENT_OPENED')
  })

  it('Tautan Drive L1–2 lewat CSSE tercatat; L3–5 ditolak lewat jalur ini', async () => {
    const s = await seed()
    const l3 = await createDocumentRecord(s.owner, { documentName: 'Rahasia', securityLevel: '3', externalUrl: 'https://drive.google.com/file/d/AUDITFILE003/view' })
    await expect(openDriveLink(s.owner, l3.documentId)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })
})

describe('error state', () => {
  it('Drive tidak terjangkau → pencarian metadata tetap jalan, buka file error jelas', async () => {
    const s = await seed()
    setMockDriveFailure('UNAVAILABLE')
    expect((await searchDocuments(s.owner, { q: 'izin' })).results.length).toBe(1)
    await expect(getAuthorizedDocument(s.owner, s.doc.documentId)).rejects.toMatchObject({ code: 'UNAVAILABLE' })
  })
})
