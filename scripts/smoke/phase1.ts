import { BASE, Client, Smoke, auditCount, decodeLoc, divisionIdByName, inviteAndLogin, outboxToken, sql, OWNER_EMAIL } from './lib'

export default async function phase1(t: Smoke) {
  const anon = new Client()
  const loginPage = await anon.get('/login')
  t.check('Halaman /login tampil dengan tombol Google & form password', loginPage.status === 200 && loginPage.text.includes('Masuk dengan Google') && loginPage.text.includes('name="password"'))

  const guarded = await anon.get('/')
  t.check('Halaman utama tanpa sesi → redirect /login', guarded.status === 307 && guarded.location?.includes('/login') === true, `${guarded.status} ${guarded.location}`)

  // Owner login Google (bootstrap)
  const owner = new Client('owner')
  const ol = await owner.loginGoogle(OWNER_EMAIL)
  t.check('Owner masuk dengan Google → diarahkan ke Command Center', ol.status === 303 && ol.location === BASE + '/', `${ol.status} ${ol.location}`)
  const home = await owner.get('/')
  t.check('Command Center tampil untuk Owner', home.status === 200 && home.text.includes('Command Center') && home.text.includes('dr. Metz'))

  // Owner mengundang staf (password) dan GM (Google)
  const div = await divisionIdByName('Legal/Perizinan')
  const staf = await inviteAndLogin(owner, { email: 'staf.legal@drmetz.test', name: 'Staf Legal', roleId: 'DIVISION_USER', divisionId: div })
  t.check('User diundang set password via email undangan lalu login password', (await staf.get('/')).status === 200)

  const gmail = await inviteAndLogin(owner, { email: 'staf.pribadi@gmail.com', name: 'Staf Gmail', roleId: 'DIVISION_USER', divisionId: div })
  const gmail2 = new Client()
  const gl = await gmail2.loginGoogle('staf.pribadi@gmail.com')
  t.check('User diundang (Gmail pribadi) juga bisa masuk dengan Google', gl.location === BASE + '/' && !!gmail, decodeLoc(gl.location))

  const gm = await inviteAndLogin(owner, { email: 'gm@drmetz.test', name: 'GM Klinik', roleId: 'GM' })
  t.check('GM diundang dan masuk dengan Google', (await gm.get('/')).status === 200)

  // Tidak diundang
  const before = await auditCount('LOGIN_REJECTED')
  const stranger = new Client()
  const s1 = await stranger.loginGoogle('orang.asing@gmail.com')
  const s2 = await stranger.loginPassword('orang.asing@gmail.com', 'apapun123')
  t.check('Email tak diundang ditolak (Google & password)', decodeLoc(s1.location).includes('belum diundang') && decodeLoc(s2.location).includes('belum diundang'), `${decodeLoc(s1.location)} | ${decodeLoc(s2.location)}`)
  t.check('Penolakan tercatat sebagai LOGIN_REJECTED', (await auditCount('LOGIN_REJECTED')) === before + 2)

  // Owner/GM password ditolak
  const gmPw = await new Client().loginPassword('gm@drmetz.test', 'rahasia-123')
  t.check('GM login dengan password ditolak (wajib Google)', decodeLoc(gmPw.location).includes('wajib masuk dengan Google'), decodeLoc(gmPw.location))

  // Lockout
  const brute = new Client()
  let last = ''
  for (let i = 0; i < 6; i++) last = decodeLoc((await brute.loginPassword('staf.legal@drmetz.test', 'salah-total')).location)
  const correctWhileLocked = decodeLoc((await brute.loginPassword('staf.legal@drmetz.test', 'rahasia-123')).location)
  t.check('Setelah 5 kali salah akun terkunci; password benar pun ditolak', last.includes('terkunci') && correctWhileLocked.includes('terkunci'), `${last} | ${correctWhileLocked}`)
  t.check('Audit LOGIN_FAILED dan ACCOUNT_LOCKED tercatat', (await auditCount('LOGIN_FAILED')) >= 5 && (await auditCount('ACCOUNT_LOCKED')) === 1)

  // Reset password membuka kunci
  await brute.post('/api/auth/forgot', { email: 'staf.legal@drmetz.test' })
  const token = await outboxToken('staf.legal@drmetz.test')
  const rp = await brute.get(`/reset-password?token=${token}`)
  t.check('Halaman reset password tampil dari tautan email', rp.status === 200 && rp.text.includes('Password baru'))
  await brute.post('/api/auth/password-token', { token: token!, password: 'baru-123456', confirm: 'baru-123456' })
  const afterReset = await brute.loginPassword('staf.legal@drmetz.test', 'baru-123456')
  t.check('Reset password via email berfungsi & membuka kunci', afterReset.location === BASE + '/', decodeLoc(afterReset.location))

  // Staf tidak bisa membuka admin
  const adminAsStaf = await staf.get('/admin/users')
  t.check('Division User membuka /admin/users → Akses ditolak', adminAsStaf.status === 200 && adminAsStaf.text.includes('Akses ditolak'))
  const apiAsStaf = await staf.getJson('/api/admin/users')
  t.check('API admin untuk Division User → 403 ACCESS_DENIED', apiAsStaf.status === 403 && apiAsStaf.json().code === 'ACCESS_DENIED')

  // Nonaktifkan
  const [stafRow] = await sql()<{ user_id: string }[]>`select user_id from users where email = 'staf.pribadi@gmail.com'`
  await owner.post(`/api/admin/users/${stafRow.user_id}/deactivate`)
  const afterDeact = await gmail2.get('/')
  t.check('Sesi user yang dinonaktifkan langsung tidak berlaku', afterDeact.status === 307 && afterDeact.location?.includes('/login') === true, `${afterDeact.status}`)
  const relog = await new Client().loginGoogle('staf.pribadi@gmail.com')
  t.check('User nonaktif melihat pesan "Akun dinonaktifkan"', decodeLoc(relog.location).includes('Akun dinonaktifkan'), decodeLoc(relog.location))

  // Data model
  const [col] = await sql()<{ is_nullable: string }[]>`select is_nullable from information_schema.columns where table_name='users' and column_name='drmetz_identity_id'`
  const [ids] = await sql()<{ n: number }[]>`select count(*)::int as n from users where user_id is null`
  t.check('Setiap user punya user_id internal; drmetz_identity_id nullable', col?.is_nullable === 'YES' && ids.n === 0)

  const [ev] = await sql()<{ actor_email: string; occurred_at: Date; result: string; action: string }[]>`
    select actor_email, occurred_at, result, action from audit_events where action = 'LOGIN_SUCCEEDED' order by occurred_at limit 1`
  t.check('Audit login berisi actor, email, waktu, hasil', !!ev?.actor_email && !!ev.occurred_at && ev.result === 'SUCCESS')

  // Logout
  const lo = await owner.post('/api/auth/logout')
  const afterLogout = await owner.get('/')
  t.check('Logout mencabut sesi', lo.status === 303 && afterLogout.status === 307)
}
