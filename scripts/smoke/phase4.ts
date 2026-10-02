import { Client, Smoke, auditCount, categoryIdByName, createDoc, decodeLoc, divisionIdByName, inviteAndLogin, sql, OWNER_EMAIL } from './lib'
import postgres from 'postgres'
import { SMOKE_DB_URL } from './lib'

export default async function phase4(t: Smoke) {
  const owner = new Client('owner')
  await owner.loginGoogle(OWNER_EMAIL)
  const legal = (await divisionIdByName('Legal/Perizinan'))!
  await owner.post('/api/admin/divisions', { divisionName: 'HR' })
  const hrDiv = (await divisionIdByName('HR'))!
  const pic = await inviteAndLogin(owner, { email: 'pic@drmetz.test', name: 'Rina PIC', roleId: 'DIVISION_USER', divisionId: legal })
  const same = await inviteAndLogin(owner, { email: 'staf@drmetz.test', name: 'Staf Legal', roleId: 'DIVISION_USER', divisionId: legal })
  const hr = await inviteAndLogin(owner, { email: 'hr@drmetz.test', name: 'Staf HR', roleId: 'DIVISION_USER', divisionId: hrDiv })
  const gm = await inviteAndLogin(owner, { email: 'gm@drmetz.test', name: 'GM', roleId: 'GM' })
  const [picRow] = await sql()<{ user_id: string }[]>`select user_id from users where email = 'pic@drmetz.test'`
  const [hrRow] = await sql()<{ user_id: string }[]>`select user_id from users where email = 'hr@drmetz.test'`
  const cat = (await categoryIdByName('Kontrak'))!

  const ids: Record<number, string> = {}
  for (const level of [1, 2, 3, 4, 5]) {
    ids[level] = await createDoc(owner, {
      documentName: `Dokumen Level ${level}`, securityLevel: String(level), divisionId: legal, picUserId: picRow.user_id, categoryId: cat,
      externalUrl: `https://drive.google.com/file/d/SMOKEFILE${level}xyz/view`, confirmedSummary: `Isi ringkasan L${level}`,
    })
  }

  // Siapa melihat apa (daftar)
  const listed = async (c: Client) => {
    const r = await c.getJson('/api/documents')
    return new Set(r.json().data.map((d: { documentId: string }) => d.documentId))
  }
  const expectVisible: [Client, string, number[]][] = [
    [owner, 'Owner', [1, 2, 3, 4, 5]], [gm, 'GM', [1, 2, 3, 4]], [pic, 'PIC', [1, 2, 3, 4]], [same, 'Staf divisi', [1, 2, 3]], [hr, 'Staf divisi lain', [1]],
  ]
  for (const [c, label, levels] of expectVisible) {
    const s = await listed(c)
    const got = [1, 2, 3, 4, 5].filter((l) => s.has(ids[l]))
    t.check(`${label} hanya melihat L${levels.join(',')}`, JSON.stringify(got) === JSON.stringify(levels), `dapat: ${got}`)
  }

  // HR membuka L5
  const before = await auditCount('ACCESS_DENIED')
  const pageL5 = await hr.get(`/documents/${ids[5]}`)
  const apiL5 = await hr.getJson(`/api/documents/${ids[5]}`)
  t.check('HR membuka URL dokumen L5 → Akses ditolak (UI)', pageL5.text.includes('Akses ditolak') && !pageL5.text.includes('Dokumen Level 5'))
  t.check('HR membuka API dokumen L5 → 403 ACCESS_DENIED', apiL5.status === 403 && apiL5.json().code === 'ACCESS_DENIED')
  t.check('Penolakan diaudit', (await auditCount('ACCESS_DENIED')) === before + 2)

  // Link Drive
  let leaked = false
  for (const c of [owner, gm, pic, same]) {
    const all = await c.getJson('/api/documents')
    for (const d of all.json().data) if (d.securityLevel >= 3 && d.externalUrl) leaked = true
    for (const l of [3, 4, 5]) {
      const r = await c.getJson(`/api/documents/${ids[l]}`)
      if (r.status === 200 && (r.json().data.externalUrl || r.text.includes(`SMOKEFILE${l}`) && c !== owner)) leaked = true
    }
  }
  t.check('Dokumen L3–5 tidak pernah mengekspos tautan Drive (daftar & detail)', !leaked)
  const l2 = await same.get(`/documents/${ids[2]}`)
  const viaCsse = await same.get(`/api/documents/${ids[2]}/open-drive`)
  t.check('Dokumen L2 menampilkan tombol "Buka di Google Drive" (tercatat lewat CSSE) untuk divisinya',
    l2.text.includes('Buka di Google Drive') && viaCsse.status === 303 && viaCsse.location!.includes('SMOKEFILE2'))
  const l3same = await same.get(`/documents/${ids[3]}`)
  t.check('Staf divisi melihat L3 tanpa ringkasan & dengan opsi ajukan akses', l3same.text.includes('Ajukan permintaan akses') && !l3same.text.includes('Isi ringkasan L3'))
  const l3pic = await pic.get(`/documents/${ids[3]}`)
  t.check('PIC melihat L3 dengan tombol "Buka lewat CSSE"', l3pic.text.includes('Buka lewat CSSE'))

  // RLS langsung di DB
  const direct = postgres(SMOKE_DB_URL, { max: 1, onnotice: () => {} })
  const rows = await direct.begin(async (tx) => {
    await tx`select set_config('csse.user_id', ${hrRow.user_id}, true)`
    await tx.unsafe('set local role csse_app_user')
    return tx<{ document_name: string }[]>`select document_name from documents`
  })
  await direct.end()
  t.check('Query langsung ke DB sebagai user HR dibatasi RLS (hanya L1)', rows.length === 1 && rows[0].document_name === 'Dokumen Level 1', JSON.stringify(rows))

  // Grant eksplisit
  const g = await owner.post(`/api/documents/${ids[5]}/permissions`, { principal: `USER:${hrRow.user_id}`, permissionType: 'OPEN', expiresAt: '2099-12-31' })
  t.check('Owner memberi izin eksplisit ke satu user', decodeLoc(g.location).includes('Izin ditambahkan'), decodeLoc(g.location))
  t.check('Grant: hanya user itu yang kini melihat L5', (await listed(hr)).has(ids[5]) && !(await listed(same)).has(ids[5]) && !(await listed(gm)).has(ids[5]))
  await sql()`update permissions set expires_at = now() - interval '1 minute' where resource_id = ${ids[5]}`
  t.check('Grant kedaluwarsa tidak berlaku', !(await listed(hr)).has(ids[5]))

  // Ubah level
  const lv = await owner.post(`/api/documents/${ids[2]}/level`, { securityLevel: '3' })
  t.check('Owner menaikkan level L2→L3 (dengan pengingat pindah ke Shared Drive terbatas)', decodeLoc(lv.location).includes('Shared Drive terbatas'), decodeLoc(lv.location))
  const nowL3 = await same.getJson(`/api/documents/${ids[2]}`)
  t.check('Setelah naik level, tautan Drive tak lagi diberikan ke staf', nowL3.json().data.externalUrl === null)
  const gmLevel = await gm.postJson(`/api/documents/${ids[1]}/level`, { securityLevel: '5' })
  t.check('GM tidak bisa mengubah level (403)', gmLevel.status === 403)
  const [pc] = await sql()<{ n: number }[]>`select count(*)::int as n from audit_events where action = 'PERMISSION_CHANGED' and result = 'SUCCESS' and metadata->>'kind' = 'SECURITY_LEVEL'`
  t.check('Perubahan level diaudit sebagai PERMISSION_CHANGED', pc.n === 1)

  // Wajib persetujuan Owner
  await owner.post(`/api/documents/${ids[3]}/owner-approval`, { required: 'true' })
  const gmEdit = await gm.postJson(`/api/documents/${ids[3]}`, { documentName: 'Diubah GM' })
  const gmPage = await gm.get(`/documents/${ids[3]}`)
  t.check('Dokumen wajib persetujuan Owner: GM tidak bisa mengubah & tidak bisa membuka (permintaan ke Owner menunggu)',
    gmEdit.status === 403 && !gmPage.text.includes('Buka lewat CSSE') && (gmPage.text.includes('wajib persetujuan Owner') || gmPage.text.includes('Menunggu keputusan')))
}
