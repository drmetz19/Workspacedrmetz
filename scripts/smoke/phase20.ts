import { BASE, Client, Smoke, auditCount, decodeLoc, divisionIdByName, sql, OWNER_EMAIL } from './lib'

export default async function phase20(t: Smoke) {
  const owner = new Client('owner')
  await owner.loginGoogle(OWNER_EMAIL)
  await owner.post('/api/admin/divisions', { divisionName: 'Finance' })
  const finance = (await divisionIdByName('Finance'))!

  const page = await owner.get('/admin/users')
  t.check('Halaman User & Akun menampilkan password default per divisi', page.text.includes('Finance@DrMetz2026') && page.text.includes('Legal@DrMetz2026'))

  // Tambah staf langsung dengan password default
  const add = await owner.post('/api/admin/users', { email: 'fin@drmetz.test', name: 'Staf Finance', roleId: 'DIVISION_USER', divisionId: finance, loginMode: 'DEFAULT_PASSWORD' })
  t.check('Owner menambah staf dengan password default', add.status === 303 && decodeLoc(add.location).includes('password default'), decodeLoc(add.location))

  // Staf lama yang belum pernah masuk → aktivasi massal
  await sql()`insert into users (email, name, role_id, division_id, status) values ('legal.lama@drmetz.test', 'Legal Lama', 'DIVISION_USER', ${(await divisionIdByName('Legal/Perizinan'))!}, 'INVITED')`
  const bulk = await owner.post('/api/admin/users/default-passwords')
  t.check('Aktivasi massal untuk Division User yang belum masuk', decodeLoc(bulk.location).includes('1 akun divisi'), decodeLoc(bulk.location))

  // Staf masuk dengan email + password default → wajib ganti password
  const staf = new Client('staf')
  const login = await staf.loginPassword('fin@drmetz.test', 'Finance@DrMetz2026')
  t.check('Staf masuk dengan email + password default', login.status === 303 && login.location === BASE + '/', `${login.status} ${login.location}`)
  const home = await staf.get('/')
  t.check('Halaman aplikasi diarahkan ke Buat password baru', home.status === 307 && !!home.location?.includes('/change-password'), `${home.status} ${home.location}`)
  const api = await staf.getJson('/api/search')
  t.check('API ditolak PASSWORD_CHANGE_REQUIRED sebelum ganti password', api.status === 403 && api.text.includes('PASSWORD_CHANGE_REQUIRED'))
  const same = await staf.post('/api/auth/change-password', { password: 'Finance@DrMetz2026', confirm: 'Finance@DrMetz2026' })
  t.check('Password baru tidak boleh pola default', decodeLoc(same.location).includes('pola password default'))
  const ok = await staf.post('/api/auth/change-password', { password: 'rahasia-finance-1', confirm: 'rahasia-finance-1' })
  t.check('Ganti password → masuk ke aplikasi', ok.status === 303 && (await staf.get('/')).status === 200)

  const old = await new Client().loginPassword('fin@drmetz.test', 'Finance@DrMetz2026')
  t.check('Password default tidak berlaku lagi', decodeLoc(old.location).includes('salah'), decodeLoc(old.location))
  const legal = await new Client().loginPassword('legal.lama@drmetz.test', 'Legal@DrMetz2026')
  t.check('Staf hasil aktivasi massal bisa masuk dengan Legal@DrMetz2026', legal.location === BASE + '/')
  t.check('Tercatat di audit (PASSWORD_DEFAULT_SET, PASSWORD_CHANGED)', (await auditCount('PASSWORD_DEFAULT_SET')) === 2 && (await auditCount('PASSWORD_CHANGED')) === 1)
}
