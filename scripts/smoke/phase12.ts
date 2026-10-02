import { Client, Smoke, addDriveFile, createDoc, decodeLoc, divisionIdByName, inviteAndLogin, sql, OWNER_EMAIL } from './lib'

export default async function phase12(t: Smoke) {
  const owner = new Client('owner')
  await owner.loginGoogle(OWNER_EMAIL)
  const legal = (await divisionIdByName('Legal/Perizinan'))!
  const staf = await inviteAndLogin(owner, { email: 'staf@drmetz.test', name: 'Budi Staf', roleId: 'DIVISION_USER', divisionId: legal })
  const gm = await inviteAndLogin(owner, { email: 'gm@drmetz.test', name: 'Hendra GM', roleId: 'GM' })
  await new Client().loginPassword('staf@drmetz.test', 'salah-sekali')
  await new Client().loginGoogle('penyusup@gmail.com')
  await sql()`insert into dev_drive_files (container_id, file_id, name, content) values ('mock-terbatas-12', 'SMK12L3FILE1', 'l3.pdf', ${Buffer.from('%PDF isi')})`
  const l2 = await createDoc(owner, { documentName: 'Izin Operasional Klinik', securityLevel: '2', divisionId: legal, externalUrl: 'https://drive.google.com/file/d/SMK12L2FILE1/view' })
  const l3 = await createDoc(owner, { documentName: 'Kontrak Vendor', securityLevel: '3', divisionId: legal, externalUrl: 'https://drive.google.com/file/d/SMK12L3FILE1/view' })
  await owner.post(`/api/documents/${l2}`, { documentName: 'Izin Operasional Klinik Jakarta', securityLevel: '2', divisionId: legal, externalUrl: 'https://drive.google.com/file/d/SMK12L2FILE1/view' })
  await staf.get(`/api/documents/${l2}/open-drive`)
  await owner.get(`/api/files/${l3}?download=1`)
  await staf.get(`/api/files/${l3}`)
  await staf.post('/api/access-requests', { documentId: l3, reason: 'Perlu untuk audit' })
  const [r] = await sql()<{ request_id: string }[]>`select request_id from access_requests limit 1`
  await gm.post(`/api/access-requests/${r.request_id}/reject`, { note: 'tidak perlu' })
  await staf.post('/api/access-requests', { documentId: l3, reason: 'Perlu untuk audit ulang' })
  const [r2] = await sql()<{ request_id: string }[]>`select request_id from access_requests where status = 'PENDING' limit 1`
  await owner.post(`/api/access-requests/${r2.request_id}/approve`, { durationDays: '1' })
  await owner.post(`/api/documents/${l2}/level`, { securityLevel: '1' })
  await owner.get('/search/ask?q=' + encodeURIComponent('izin operasional klinik'))

  // Checklist story 46
  const required = ['LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGIN_REJECTED', 'DOCUMENT_CREATED', 'DOCUMENT_UPDATED', 'DOCUMENT_OPENED', 'DOCUMENT_DOWNLOADED',
    'ACCESS_DENIED', 'APPROVAL_REQUESTED', 'ACCESS_APPROVED', 'ACCESS_REJECTED', 'PERMISSION_CHANGED', 'AI_DOCUMENT_QUERIED']
  const have = new Set((await sql()<{ action: string }[]>`select distinct action from audit_events`).map((x) => x.action))
  const missing = required.filter((a) => !have.has(a))
  t.check('Checklist event story 46 lengkap di log', missing.length === 0, `kurang: ${missing.join(', ')}`)
  const [complete] = await sql()<{ n: number }[]>`select count(*)::int as n from audit_events where action in ('DOCUMENT_OPENED','DOCUMENT_DOWNLOADED') and actor_email is not null and occurred_at is not null and result is not null and resource_id is not null`
  t.check('Event berisi siapa/akun/kapan/resource/hasil', complete.n >= 2)

  const page = await owner.get('/audit')
  t.check('Halaman audit (Owner) tampil dengan filter', page.status === 200 && page.text.includes('Log Audit') && page.text.includes('Terapkan filter'))
  const [stafRow] = await sql()<{ user_id: string }[]>`select user_id from users where email = 'staf@drmetz.test'`
  const byUser = await owner.getJson(`/api/audit?actorUserId=${stafRow.user_id}`)
  const byDoc = await owner.getJson(`/api/audit?documentId=${l3}&action=ACCESS_DENIED`)
  const byResult = await owner.getJson('/api/audit?result=REJECTED')
  t.check('Filter per user / dokumen+aksi / hasil benar',
    byUser.json().data.events.every((e: { actorUserId: string }) => e.actorUserId === stafRow.user_id) &&
    byDoc.json().data.events.length === 1 && byDoc.json().data.events[0].actorEmail === 'staf@drmetz.test' &&
    byResult.json().data.events.every((e: { result: string }) => e.result === 'REJECTED') && byResult.json().data.events.length >= 1)
  const range = await owner.getJson('/api/audit?to=2020-01-01')
  t.check('Filter tanggal', range.json().data.events.length === 0)
  const csv = await owner.get('/api/audit?format=csv')
  t.check('Ekspor CSV', csv.status === 200 && csv.headers.get('content-type')!.includes('text/csv') && csv.text.startsWith('waktu_utc,aksi'))

  const stafAudit = await staf.get('/audit')
  const stafApi = await staf.getJson('/api/audit')
  t.check('Non-Owner tidak bisa melihat audit', stafAudit.text.includes('hanya dapat dilihat Owner') && stafApi.status === 403)
  const del = await owner.req('DELETE', '/api/audit')
  const put = await owner.req('PUT', '/api/audit')
  t.check('Tidak ada endpoint ubah/hapus audit (405)', del.status === 405 && put.status === 405)
  let dbBlocked = false
  try { await sql()`update audit_events set result = 'SUCCESS' where result = 'DENIED'` } catch { dbBlocked = true }
  let delBlocked = false
  try { await sql()`delete from audit_events` } catch { delBlocked = true }
  t.check('Update/delete langsung ke DB ditolak (append-only)', dbBlocked && delBlocked)

  // Error state: Drive tidak terjangkau
  await addDriveFile('x', '__FAIL_MODE__', 'UNAVAILABLE')
  const search = await owner.getJson('/api/search?q=kontrak')
  const open = await owner.get(`/api/files/${l3}`)
  t.check('Drive tidak terjangkau → pencarian tetap jalan, buka file menampilkan pesan jelas',
    search.json().data.results.length === 1 && open.status === 303 && decodeLoc(open.location).includes('Google Drive sedang tidak dapat dijangkau'))
  await sql()`delete from dev_drive_files where file_id = '__FAIL_MODE__'`

  // Otorisasi Drive dicabut → peringatan di dashboard Owner
  await owner.post('/api/sources', { folder: 'mock-terbatas-12', sourceType: 'RESTRICTED', defaultDivisionId: legal })
  const [src] = await sql()<{ source_id: string }[]>`select source_id from drive_sources limit 1`
  await addDriveFile('x', '__FAIL_MODE__', 'AUTH')
  await owner.post(`/api/sources/${src.source_id}/scan`)
  const dash = await owner.get('/')
  t.check('Kredensial Drive dicabut → kartu peringatan di dashboard Owner', dash.text.includes('Koneksi Google Drive bermasalah') && dash.text.includes('Drive Belum Terhubung'))
  const stafDash = await staf.get('/')
  t.check('Peringatan otorisasi hanya untuk Owner', !stafDash.text.includes('Koneksi Google Drive bermasalah'))
  await sql()`delete from dev_drive_files where file_id = '__FAIL_MODE__'`
}
