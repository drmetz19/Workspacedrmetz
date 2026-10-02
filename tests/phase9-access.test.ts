import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { createDocumentRecord, getDocumentMetadata, updateDocumentMetadata } from '@/server/services/documents'
import { setOwnerApprovalRequired } from '@/server/services/permissions'
import { getAuthorizedDocument } from '@/server/services/files'
import {
  approveAccessRequest, cancelAccessRequest, expireAccessGrants, listDecidedRequests, listMyRequests, listPendingApprovals,
  rejectAccessRequest, requestDocumentAccess,
} from '@/server/services/access'
import { auditActions, closeDb, createUser, divisionId, lastEmailTo, resetDb } from './helpers'

beforeEach(resetDb)
afterAll(closeDb)

async function setup() {
  const owner = await createUser({ role: 'OWNER', email: 'owner@drmetz.test' })
  const gm = await createUser({ role: 'GM', email: 'gm@drmetz.test' })
  const pic = await createUser()
  const staf = await createUser({ email: 'staf@drmetz.test', name: 'Staf' })
  const legal = await divisionId()
  await db()`insert into dev_drive_files (container_id, file_id, name, content) values
    ('mock-x', 'ACCFILE00003', 'L3.pdf', ${Buffer.from('%PDF L3')}), ('mock-x', 'ACCFILE00004', 'L4.pdf', ${Buffer.from('%PDF L4')})`
  const mk = (level: string, file: string) => createDocumentRecord(owner, { documentName: `Dokumen L${level}`, securityLevel: level, divisionId: legal, picUserId: pic.userId, externalUrl: `https://drive.google.com/file/d/${file}/view` })
  return { owner, gm, pic, staf, l3: await mk('3', 'ACCFILE00003'), l4: await mk('4', 'ACCFILE00004'), l2: await mk('2', 'ACCFILE00002') }
}

describe('permintaan akses', () => {
  it('Staf ajukan akses L3 → GM melihat di antrean → setujui 1 hari → staf bisa buka via proxy', async () => {
    const s = await setup()
    const req = await requestDocumentAccess(s.staf, s.l3.documentId, { reason: 'Perlu untuk perpanjangan izin' })
    expect(req).toMatchObject({ status: 'PENDING', approverRole: 'GM' })
    expect((await lastEmailTo('gm@drmetz.test')).subject).toContain('Permintaan akses')
    expect((await listPendingApprovals(s.gm)).map((r) => r.requestId)).toEqual([req.requestId])
    expect((await listPendingApprovals(s.owner)).length).toBe(1)
    const ok = await approveAccessRequest(s.gm, req.requestId, { durationDays: '1' })
    expect(ok).toMatchObject({ status: 'APPROVED', durationDays: 1 })
    expect(ok.expiresAt!.getTime() - Date.now()).toBeGreaterThan(23 * 3600_000)
    await expect(getAuthorizedDocument(s.staf, s.l3.documentId)).resolves.toMatchObject({ mimeType: 'application/pdf' })
    expect((await getDocumentMetadata(s.staf, s.l3.documentId)).permissions.canOpen).toBe(true)
    expect((await lastEmailTo('staf@drmetz.test')).subject).toContain('disetujui')
  })

  it('Request L4 hanya muncul di antrean Owner, tidak di GM; GM tidak bisa memutuskan', async () => {
    const s = await setup()
    const req = await requestDocumentAccess(s.gm, s.l4.documentId, { reason: 'Review kontrak vendor' })
    expect(req.approverRole).toBe('OWNER')
    expect(await listPendingApprovals(s.gm)).toEqual([])
    expect((await listPendingApprovals(s.owner)).length).toBe(1)
    const other = await createUser({ role: 'GM' })
    await expect(approveAccessRequest(other, req.requestId, { durationDays: 7 })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })

  it('Kedaluwarsa: setelah expires_at lewat (cron) → ACCESS_DENIED lagi, status EXPIRED', async () => {
    const s = await setup()
    const req = await requestDocumentAccess(s.staf, s.l3.documentId, { reason: 'Perlu untuk audit' })
    await approveAccessRequest(s.owner, req.requestId, { durationDays: 1 })
    const r = await expireAccessGrants(new Date(Date.now() + 2 * 86_400_000))
    expect(r.expired).toBe(1)
    await expect(getAuthorizedDocument(s.staf, s.l3.documentId)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    expect((await listMyRequests(s.staf))[0].status).toBe('EXPIRED')
    expect((await auditActions({ action: 'ACCESS_EXPIRED' }))[0]).toMatchObject({ result: 'SUCCESS' })
  })

  it('Penolakan wajib alasan; alasan terlihat oleh pemohon', async () => {
    const s = await setup()
    const req = await requestDocumentAccess(s.staf, s.l3.documentId, { reason: 'Perlu untuk audit' })
    await expect(rejectAccessRequest(s.gm, req.requestId, { note: '' })).rejects.toMatchObject({ code: 'VALIDATION' })
    await rejectAccessRequest(s.gm, req.requestId, { note: 'Gunakan salinan dari PIC' })
    expect((await listMyRequests(s.staf))[0]).toMatchObject({ status: 'REJECTED', decisionNote: 'Gunakan salinan dari PIC' })
    await expect(approveAccessRequest(s.owner, req.requestId, { durationDays: 7 })).rejects.toMatchObject({ code: 'CONFLICT' })
    expect((await listDecidedRequests(s.gm)).length).toBe(1)
  })

  it('Validasi: tidak bisa request jika sudah punya akses, dokumen tak terlihat, atau request ganda; tidak bisa setujui milik sendiri', async () => {
    const s = await setup()
    await expect(requestDocumentAccess(s.staf, s.l2.documentId, { reason: 'sudah bisa' })).rejects.toMatchObject({ code: 'VALIDATION' })
    const hr = await createUser({ division: 'HR' })
    await expect(requestDocumentAccess(hr, s.l3.documentId, { reason: 'ingin lihat' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    const req = await requestDocumentAccess(s.staf, s.l3.documentId, { reason: 'Perlu sekali' })
    await expect(requestDocumentAccess(s.staf, s.l3.documentId, { reason: 'Perlu lagi' })).rejects.toMatchObject({ code: 'CONFLICT' })
    await cancelAccessRequest(s.staf, req.requestId)
    const gmReq = await requestDocumentAccess(s.gm, s.l4.documentId, { reason: 'butuh baca' })
    const owner2 = await createUser({ role: 'OWNER' })
    await expect(approveAccessRequest(s.gm, gmReq.requestId, { durationDays: 1 })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    await approveAccessRequest(owner2, gmReq.requestId, { durationDays: 30 })
  })

  it('Scenario 3: GM membuka/mengubah dokumen OWNER_APPROVAL_REQUIRED → request ke Owner otomatis, aksi tidak dieksekusi', async () => {
    const s = await setup()
    await setOwnerApprovalRequired(s.owner, s.l3.documentId, true)
    await expect(getAuthorizedDocument(s.gm, s.l3.documentId)).rejects.toMatchObject({ code: 'ACCESS_DENIED', details: { autoRequested: true } })
    await expect(updateDocumentMetadata(s.gm, s.l3.documentId, { documentName: 'Diubah GM' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    const pending = await listPendingApprovals(s.owner)
    expect(pending.map((p) => [p.requestedAction, p.approverRole, p.autoCreated])).toEqual([['OPEN', 'OWNER', true], ['EDIT_METADATA', 'OWNER', true]])
    expect(await listPendingApprovals(s.gm)).toEqual([])
    const [d] = await db()`select document_name from documents where document_id = ${s.l3.documentId}`
    expect(d.document_name).toBe('Dokumen L3')
    // percobaan kedua tidak membuat duplikat
    await expect(getAuthorizedDocument(s.gm, s.l3.documentId)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    expect((await listPendingApprovals(s.owner)).length).toBe(2)
    // Owner menyetujui edit → GM bisa mengubah
    await approveAccessRequest(s.owner, pending[1].requestId, { durationDays: 1 })
    await updateDocumentMetadata(s.gm, s.l3.documentId, { documentName: 'Diubah GM setelah disetujui', securityLevel: '3' })
  })

  it('Semua langkah tercatat di audit', async () => {
    const s = await setup()
    const a = await requestDocumentAccess(s.staf, s.l3.documentId, { reason: 'satu dua' })
    await approveAccessRequest(s.gm, a.requestId, { durationDays: 1 })
    const b = await requestDocumentAccess(s.gm, s.l4.documentId, { reason: 'tiga empat' })
    await rejectAccessRequest(s.owner, b.requestId, { note: 'tidak perlu' })
    await expireAccessGrants(new Date(Date.now() + 3 * 86_400_000))
    for (const action of ['APPROVAL_REQUESTED', 'ACCESS_APPROVED', 'ACCESS_REJECTED', 'ACCESS_EXPIRED']) {
      expect((await auditActions({ action })).length, action).toBeGreaterThan(0)
    }
  })
})
