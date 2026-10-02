import { BASE, Client, Smoke, auditCount, decodeLoc, divisionIdByName, inviteAndLogin, sql, OWNER_EMAIL } from './lib'

export default async function phase2(t: Smoke) {
  const owner = new Client('owner')
  await owner.loginGoogle(OWNER_EMAIL)

  const cats = await owner.get('/admin/categories')
  const seeds = ['Izin Operasional', 'SIP', 'STR', 'Kontrak', 'MoU', 'Sewa', 'Sertifikat', 'Lainnya']
  t.check('Halaman kategori menampilkan 8 kategori seed', cats.status === 200 && seeds.every((s) => cats.text.includes(s)))

  const nd = await owner.post('/api/admin/divisions', { divisionName: 'Finance' })
  t.check('Owner membuat divisi Finance', decodeLoc(nd.location).includes('Divisi Finance dibuat'), decodeLoc(nd.location))
  const finId = await divisionIdByName('Finance')
  const ud = await owner.post(`/api/admin/divisions/${finId}`, { divisionName: 'Finance & Akuntansi', status: 'ACTIVE' })
  t.check('Owner mengubah nama divisi', decodeLoc(ud.location).includes('disimpan') && !!(await divisionIdByName('Finance & Akuntansi')))
  const dup = await owner.post('/api/admin/divisions', { divisionName: 'Legal/Perizinan' })
  t.check('Nama divisi duplikat ditolak dengan pesan jelas', decodeLoc(dup.location).includes('sudah dipakai'), decodeLoc(dup.location))

  const nc = await owner.post('/api/admin/categories', { categoryName: 'Akreditasi' })
  t.check('Owner membuat kategori baru', decodeLoc(nc.location).includes('Akreditasi dibuat'))
  const [cat] = await sql()<{ category_id: string }[]>`select category_id from categories where category_name = 'Akreditasi'`
  await owner.post(`/api/admin/categories/${cat.category_id}`, { categoryName: 'Akreditasi', status: 'INACTIVE' })
  const catsApi = await owner.getJson('/api/categories')
  t.check('Kategori nonaktif tidak muncul di daftar pilihan', !catsApi.json().data.some((c: { categoryName: string }) => c.categoryName === 'Akreditasi'))

  // Ubah role & divisi user → berlaku langsung
  const legal = await divisionIdByName('Legal/Perizinan')
  const staf = await inviteAndLogin(owner, { email: 'staf@drmetz.test', name: 'Staf', roleId: 'DIVISION_USER', divisionId: legal })
  const [s] = await sql()<{ user_id: string }[]>`select user_id from users where email = 'staf@drmetz.test'`
  const fin = (await divisionIdByName('Finance & Akuntansi'))!
  const up = await owner.post(`/api/admin/users/${s.user_id}`, { name: 'Staf Finance', roleId: 'DIVISION_USER', divisionId: fin })
  t.check('Owner mengubah divisi & nama user', decodeLoc(up.location).includes('disimpan'), decodeLoc(up.location))
  const home = await staf.get('/')
  t.check('Perubahan langsung berlaku pada sesi user (nama baru tampil)', home.text.includes('Staf Finance'))

  // Akses admin oleh non-Owner
  const gm = await inviteAndLogin(owner, { email: 'gm@drmetz.test', name: 'GM', roleId: 'GM' })
  const before = await auditCount('ADMIN_PAGE_OPENED', { result: 'DENIED' })
  const pages = ['/admin/users', '/admin/divisions', '/admin/categories']
  let allDenied = true
  for (const p of pages) {
    for (const c of [gm, staf]) {
      const r = await c.get(p)
      if (!(r.status === 200 && r.text.includes('Akses ditolak'))) allDenied = false
    }
  }
  t.check('GM & Division User membuka /admin/* → Akses ditolak', allDenied)
  t.check('Setiap percobaan akses admin ditolak diaudit', (await auditCount('ADMIN_PAGE_OPENED', { result: 'DENIED' })) === before + 6)
  const apiDenied = await gm.postJson('/api/admin/divisions', { divisionName: 'Coba' })
  t.check('API admin oleh GM → 403', apiDenied.status === 403)

  const counts = await sql()<{ action: string; n: number }[]>`
    select action, count(*)::int as n from audit_events where result = 'SUCCESS'
    and action in ('DIVISION_CREATED','DIVISION_UPDATED','CATEGORY_CREATED','CATEGORY_UPDATED','USER_UPDATED') group by action`
  t.check('Setiap perubahan admin menghasilkan audit event', counts.length === 5, JSON.stringify(counts))

  // Reaktivasi
  await owner.post(`/api/admin/users/${s.user_id}/deactivate`)
  await owner.post(`/api/admin/users/${s.user_id}/reactivate`)
  const relog = await new Client().loginPassword('staf@drmetz.test', 'rahasia-123')
  t.check('User yang diaktifkan kembali bisa login lagi', relog.location === BASE + '/', decodeLoc(relog.location))
}
