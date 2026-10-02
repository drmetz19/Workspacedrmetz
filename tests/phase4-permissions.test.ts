import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, withUserScope } from '@/server/db'
import type { IdentityContext } from '@/server/context'
import { canView, decide, type DocFacts, type Grant } from '@/server/permissions/engine'
import { createDocumentRecord, getDocumentMetadata, listDocuments, updateDocumentMetadata } from '@/server/services/documents'
import { changeSecurityLevel, grantDocumentPermission, listDocumentPermissions, revokeDocumentPermission, setOwnerApprovalRequired } from '@/server/services/permissions'
import { auditActions, closeDb, createUser, divisionId, resetDb } from './helpers'

beforeEach(resetDb)
afterAll(closeDb)

// ── Tabel kebijakan level: setiap sel × setiap jenis user ─────────────────
const DIV_A = '00000000-0000-4000-8000-00000000000a'
const DIV_B = '00000000-0000-4000-8000-00000000000b'
const ctx = (roleId: IdentityContext['roleId'], userId: string, divisionId: string | null): IdentityContext => ({
  userId, roleId, divisionId, email: `${userId}@t`, name: userId, source: 'UI',
})
const OWNER = ctx('OWNER', 'owner', null)
const GM = ctx('GM', 'gm', null)
const PIC = ctx('DIVISION_USER', 'pic', DIV_A)
const SAME_DIV = ctx('DIVISION_USER', 'same', DIV_A)
const OTHER_DIV = ctx('DIVISION_USER', 'other', DIV_B)
const doc = (level: number, extra: Partial<DocFacts> = {}): DocFacts => ({
  documentId: 'd', securityLevel: level, divisionId: DIV_A, picUserId: 'pic', ownerApprovalRequired: false, status: 'ACTIVE', ...extra,
})

// [level, actor, boleh tahu, boleh buka, cara buka/approver]
const MATRIX: [number, IdentityContext, boolean, boolean][] = [
  [1, OWNER, true, true], [1, GM, true, true], [1, PIC, true, true], [1, SAME_DIV, true, true], [1, OTHER_DIV, true, true],
  [2, OWNER, true, true], [2, GM, true, true], [2, PIC, true, true], [2, SAME_DIV, true, true], [2, OTHER_DIV, false, false],
  [3, OWNER, true, true], [3, GM, true, true], [3, PIC, true, true], [3, SAME_DIV, true, false], [3, OTHER_DIV, false, false],
  [4, OWNER, true, true], [4, GM, true, false], [4, PIC, true, true], [4, SAME_DIV, false, false], [4, OTHER_DIV, false, false],
  [5, OWNER, true, true], [5, GM, false, false], [5, PIC, false, false], [5, SAME_DIV, false, false], [5, OTHER_DIV, false, false],
]

describe('engine: tabel kebijakan level', () => {
  it.each(MATRIX.map(([l, a, v, o]) => [`L${l}`, a.userId, v, o, l, a] as const))('%s · %s → tahu=%s buka=%s', (_l, _n, view, open, level, actor) => {
    const d = doc(level)
    expect(decide(actor, d, 'VIEW').allowed).toBe(view)
    expect(decide(actor, d, 'OPEN').allowed).toBe(open)
  })

  it('Permintaan akses: L3 approver GM, L4–5 approver Owner; tidak bisa request kalau tidak tahu dokumen ada', () => {
    expect(decide(SAME_DIV, doc(3), 'OPEN')).toMatchObject({ requestable: true, approver: 'GM' })
    expect(decide(GM, doc(4), 'OPEN')).toMatchObject({ requestable: true, approver: 'OWNER' })
    expect(decide(OTHER_DIV, doc(3), 'OPEN')).toMatchObject({ requestable: false, approver: null })
  })

  it('OWNER_APPROVAL_REQUIRED: GM kehilangan hak buka & ubah default; approver Owner', () => {
    const d = doc(3, { ownerApprovalRequired: true })
    expect(decide(GM, d, 'VIEW').allowed).toBe(true)
    expect(decide(GM, d, 'OPEN')).toMatchObject({ allowed: false, reason: 'OWNER_APPROVAL_REQUIRED', approver: 'OWNER' })
    expect(decide(GM, d, 'EDIT_METADATA')).toMatchObject({ allowed: false, reason: 'OWNER_APPROVAL_REQUIRED' })
    expect(decide(OWNER, d, 'OPEN').allowed).toBe(true)
  })

  it('Grant eksplisit menambah hak; grant kedaluwarsa/dicabut tidak berlaku', () => {
    const now = new Date('2026-10-02T00:00:00Z')
    const g = (over: Partial<Grant>): Grant => ({ permissionType: 'OPEN', principalType: 'USER', principalId: 'other', expiresAt: null, ...over })
    expect(decide(OTHER_DIV, doc(5), 'OPEN', [g({})], now).allowed).toBe(true)
    expect(decide(OTHER_DIV, doc(5), 'OPEN', [g({ expiresAt: new Date('2026-10-01T00:00:00Z') })], now).allowed).toBe(false)
    expect(decide(OTHER_DIV, doc(5), 'OPEN', [g({ revokedAt: new Date() })], now).allowed).toBe(false)
    expect(decide(OTHER_DIV, doc(5), 'VIEW', [g({ permissionType: 'VIEW', principalType: 'DIVISION', principalId: DIV_B })], now).allowed).toBe(true)
    expect(decide(OTHER_DIV, doc(5), 'OPEN', [g({ permissionType: 'VIEW', principalType: 'DIVISION', principalId: DIV_B })], now).allowed).toBe(false)
    expect(decide(SAME_DIV, doc(4), 'VIEW', [g({ permissionType: 'VIEW', principalType: 'ROLE', principalId: 'DIVISION_USER' })], now).allowed).toBe(true)
  })

  it('Ubah metadata: Owner, GM, PIC, grant EDIT_METADATA; arsip & level hanya Owner', () => {
    expect(decide(PIC, doc(2), 'EDIT_METADATA').allowed).toBe(true)
    expect(decide(SAME_DIV, doc(2), 'EDIT_METADATA').allowed).toBe(false)
    expect(decide(GM, doc(2), 'ARCHIVE').allowed).toBe(false)
    expect(decide(GM, doc(2), 'CHANGE_LEVEL').allowed).toBe(false)
    expect(decide(OWNER, doc(2), 'CHANGE_LEVEL').allowed).toBe(true)
  })

  it('DRAFT hanya untuk Owner, GM, PIC', () => {
    const d = doc(1, { status: 'DRAFT' })
    expect(canView(OWNER, d)).toBe(true)
    expect(canView(GM, d)).toBe(true)
    expect(canView(PIC, d)).toBe(true)
    expect(canView(SAME_DIV, d)).toBe(false)
  })
})

// ── Paritas engine TS ↔ fungsi SQL + RLS dengan data nyata ───────────────
async function categoryId() {
  const [r] = await db()<{ category_id: string }[]>`select category_id from categories limit 1`
  return r.category_id
}

async function setup() {
  const owner = await createUser({ role: 'OWNER' })
  const gm = await createUser({ role: 'GM' })
  const pic = await createUser({ name: 'PIC' })
  const same = await createUser({ name: 'Same' })
  const hr = await createUser({ name: 'HR', division: 'HR' })
  const legal = await divisionId()
  const docs: Record<number, string> = {}
  for (const level of [1, 2, 3, 4, 5]) {
    const d = await createDocumentRecord(owner, {
      documentName: `Dokumen L${level}`, securityLevel: String(level), divisionId: legal, picUserId: pic.userId, categoryId: await categoryId(),
      externalUrl: `https://drive.google.com/file/d/FILE${level}abcdefghij/view`,
      confirmedSummary: `Ringkasan rahasia L${level}`,
    })
    docs[level] = d.documentId
  }
  return { owner, gm, pic, same, hr, docs, users: [owner, gm, pic, same, hr] }
}

describe('engine ↔ SQL ↔ RLS', () => {
  it('Daftar dokumen (fungsi SQL) identik dengan canView engine untuk semua user × level', async () => {
    const { users, docs } = await setup()
    for (const u of users) {
      const listed = new Set((await listDocuments(u, {})).map((d) => d.documentId))
      for (const id of Object.values(docs)) {
        const engine = await getDocumentMetadata(u, id).then(() => true, () => false)
        expect({ user: u.name, id, listed: listed.has(id) }).toEqual({ user: u.name, id, listed: engine })
      }
    }
  })

  it('Query langsung ke DB dengan sesi user tetap dibatasi RLS', async () => {
    const { hr, owner } = await setup()
    const asHr = await withUserScope(hr.userId, (tx) => tx<{ document_name: string }[]>`select document_name from documents order by document_name`)
    expect(asHr.map((r) => r.document_name)).toEqual(['Dokumen L1'])
    const asOwner = await withUserScope(owner.userId, (tx) => tx`select document_id from documents`)
    expect(asOwner.length).toBe(5)
    await expect(withUserScope(hr.userId, (tx) => tx`update documents set document_name = 'x'`)).rejects.toThrow()
  })

  it('User HR membuka dokumen L5 → ACCESS_DENIED dan diaudit', async () => {
    const { hr, docs } = await setup()
    await expect(getDocumentMetadata(hr, docs[5])).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    const [a] = await auditActions({ action: 'ACCESS_DENIED' })
    expect(a).toMatchObject({ resource_id: docs[5], result: 'DENIED' })
  })

  it('L3–5 tidak pernah mengekspos external_url (termasuk ke Owner); L1–2 hanya bila boleh buka', async () => {
    const { owner, same, docs } = await setup()
    for (const level of [3, 4, 5]) expect((await getDocumentMetadata(owner, docs[level])).externalUrl).toBeNull()
    expect((await getDocumentMetadata(owner, docs[2])).externalUrl).toContain('FILE2')
    expect((await getDocumentMetadata(same, docs[1])).externalUrl).toContain('FILE1')
    const l3 = await getDocumentMetadata(same, docs[3])
    expect(l3.externalUrl).toBeNull()
    expect(l3.confirmedSummary).toBeNull()
    expect(l3.permissions).toMatchObject({ canOpen: false, canRequestAccess: true, approver: 'GM', openMode: 'CSSE' })
    for (const d of await listDocuments(owner, {})) if (d.securityLevel >= 3) expect(d.externalUrl).toBeNull()
  })
})

describe('kelola izin (Owner)', () => {
  it('Grant eksplisit ke satu user: hanya user itu yang melihat; dicabut → hilang; tercatat PERMISSION_CHANGED', async () => {
    const { owner, hr, same, docs } = await setup()
    const g = await grantDocumentPermission(owner, docs[5], { principalType: 'USER', principalId: hr.userId, permissionType: 'OPEN' })
    expect((await getDocumentMetadata(hr, docs[5])).permissions.canOpen).toBe(true)
    await expect(getDocumentMetadata(same, docs[5])).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    expect((await listDocuments(hr, {})).map((d) => d.documentId)).toContain(docs[5])
    expect((await listDocumentPermissions(owner, docs[5])).length).toBe(1)
    await revokeDocumentPermission(owner, docs[5], g.permissionId)
    await expect(getDocumentMetadata(hr, docs[5])).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    const kinds = (await auditActions({ action: 'PERMISSION_CHANGED' })).map((a) => a.metadata.kind)
    expect(kinds).toEqual(['GRANT', 'REVOKE'])
  })

  it('Grant kedaluwarsa tidak berlaku (SQL & engine)', async () => {
    const { owner, hr, docs } = await setup()
    await db()`insert into permissions (resource_id, principal_type, principal_id, permission_type, expires_at)
               values (${docs[5]}, 'USER', ${hr.userId}, 'OPEN', now() - interval '1 minute')`
    await expect(getDocumentMetadata(hr, docs[5])).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    expect((await listDocuments(hr, {})).map((d) => d.documentId)).not.toContain(docs[5])
    void owner
  })

  it('Grant ke divisi berlaku untuk anggota divisi itu', async () => {
    const { owner, hr, docs } = await setup()
    await grantDocumentPermission(owner, docs[4], { principalType: 'DIVISION', principalId: hr.divisionId!, permissionType: 'VIEW' })
    const d = await getDocumentMetadata(hr, docs[4])
    expect(d.permissions.canOpen).toBe(false)
  })

  it('Owner mengubah level → diaudit sebagai PERMISSION_CHANGED; non-Owner ditolak', async () => {
    const { owner, gm, same, docs } = await setup()
    const r = await changeSecurityLevel(owner, docs[2], 3)
    expect(r).toMatchObject({ from: 2, to: 3, needsRestrictedStorage: true })
    expect((await getDocumentMetadata(same, docs[2])).permissions.canOpen).toBe(false)
    const [a] = await auditActions({ action: 'PERMISSION_CHANGED' })
    expect(a.metadata).toMatchObject({ kind: 'SECURITY_LEVEL', from: 2, to: 3 })
    await expect(changeSecurityLevel(gm, docs[2], 1)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })

  it('Owner memasang OWNER_APPROVAL_REQUIRED → GM tidak bisa mengubah metadata', async () => {
    const { owner, gm, docs } = await setup()
    await setOwnerApprovalRequired(owner, docs[3], 'on')
    const d = await getDocumentMetadata(gm, docs[3])
    expect(d.permissions).toMatchObject({ canOpen: false, canEdit: false, approver: 'OWNER' })
    await expect(updateDocumentMetadata(gm, docs[3], { documentName: 'Ubah' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })

  it('Level saat mendaftarkan dibatasi: Division User maks L3, GM maks L4', async () => {
    const staf = await createUser()
    const gm = await createUser({ role: 'GM' })
    await expect(createDocumentRecord(staf, { documentName: 'Rahasia', securityLevel: '4' })).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(createDocumentRecord(gm, { documentName: 'Rahasia', securityLevel: '5' })).rejects.toMatchObject({ code: 'VALIDATION' })
    const own = await createDocumentRecord(staf, { documentName: 'Dokumen staf', securityLevel: '3' })
    expect(own.picUserId).toBe(staf.userId)
    expect((await getDocumentMetadata(staf, own.documentId)).permissions.canOpen).toBe(true)
  })
})
