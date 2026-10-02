import { Client, Smoke, auditCount, createDoc, decodeLoc, divisionIdByName, inviteAndLogin, sql, OWNER_EMAIL } from './lib'

export default async function phase9(t: Smoke) {
  const owner = new Client('owner')
  await owner.loginGoogle(OWNER_EMAIL)
  const legal = (await divisionIdByName('Legal/Perizinan'))!
  const pic = await inviteAndLogin(owner, { email: 'pic@drmetz.test', name: 'Rina PIC', roleId: 'DIVISION_USER', divisionId: legal })
  const staf = await inviteAndLogin(owner, { email: 'staf@drmetz.test', name: 'Budi Staf', roleId: 'DIVISION_USER', divisionId: legal })
  const gm = await inviteAndLogin(owner, { email: 'gm@drmetz.test', name: 'Hendra GM', roleId: 'GM' })
  void pic
  const [picRow] = await sql()<{ user_id: string }[]>`select user_id from users where email = 'pic@drmetz.test'`
  await sql()`insert into dev_drive_files (container_id, file_id, name, content) values
    ('mock-terbatas-09', 'SMK9L3FILE01', 'L3.pdf', ${Buffer.from('%PDF isi L3')}), ('mock-terbatas-09', 'SMK9L4FILE01', 'L4.pdf', ${Buffer.from('%PDF isi L4')}),
    ('mock-terbatas-09', 'SMK9FLAG0001', 'flag.pdf', ${Buffer.from('%PDF isi flag')})`
  const l3 = await createDoc(owner, { documentName: 'SOP Sterilisasi Alat', securityLevel: '3', divisionId: legal, picUserId: picRow.user_id, externalUrl: 'https://drive.google.com/file/d/SMK9L3FILE01/view' })
  const l4 = await createDoc(owner, { documentName: 'Kontrak Laser AEVIA', securityLevel: '4', divisionId: legal, picUserId: picRow.user_id, externalUrl: 'https://drive.google.com/file/d/SMK9L4FILE01/view' })
  const flagged = await createDoc(owner, { documentName: 'Akta Perubahan Direksi', securityLevel: '3', divisionId: legal, picUserId: picRow.user_id, externalUrl: 'https://drive.google.com/file/d/SMK9FLAG0001/view' })
  await owner.post(`/api/documents/${flagged}/owner-approval`, { required: 'true' })

  // Staf → L3 → GM setujui 1 hari
  const req = await staf.post('/api/access-requests', { documentId: l3, reason: 'Perlu untuk audit internal' })
  t.check('Staf mengajukan akses L3 dari halaman dokumen', decodeLoc(req.location).includes('Permintaan akses terkirim'), decodeLoc(req.location))
  const waiting = await staf.get(`/documents/${l3}`)
  t.check('Halaman dokumen menampilkan status "Menunggu keputusan"', waiting.text.includes('Menunggu keputusan'))
  const gmQueue = await gm.get('/access')
  t.check('GM melihat permintaan di "Menunggu Tindakan Saya"', gmQueue.text.includes('SOP Sterilisasi Alat') && gmQueue.text.includes('Budi Staf') && gmQueue.text.includes('Perlu untuk audit internal'))
  const [r3] = await sql()<{ request_id: string }[]>`select request_id from access_requests where document_id = ${l3}`
  const ap = await gm.post(`/api/access-requests/${r3.request_id}/approve`, { durationDays: '1' })
  t.check('GM menyetujui 1 hari', decodeLoc(ap.location).includes('disetujui 1 hari'), decodeLoc(ap.location))
  const open = await staf.get(`/api/files/${l3}`)
  t.check('Setelah disetujui, staf bisa membuka lewat proxy', open.status === 200 && open.text.includes('isi L3'))

  // L4 → hanya Owner (staf diberi izin lihat metadata dulu agar tahu dokumennya ada)
  const [stafRow] = await sql()<{ user_id: string }[]>`select user_id from users where email = 'staf@drmetz.test'`
  await owner.post(`/api/documents/${l4}/permissions`, { principal: `USER:${stafRow.user_id}`, permissionType: 'VIEW' })
  await staf.post('/api/access-requests', { documentId: l4, reason: 'Butuh cek nilai kontrak' })
  const gmQ2 = await gm.getJson('/api/access-requests?scope=pending')
  const ownerQ = await owner.getJson('/api/access-requests?scope=pending')
  t.check('Request L4 hanya di antrean Owner, tidak di GM',
    !gmQ2.json().data.some((r: { documentId: string }) => r.documentId === l4) && ownerQ.json().data.some((r: { documentId: string }) => r.documentId === l4))
  const [r4] = await sql()<{ request_id: string }[]>`select request_id from access_requests where document_id = ${l4}`
  const gmApprove = await gm.postJson(`/api/access-requests/${r4.request_id}/approve`, { durationDays: 7 })
  t.check('GM tidak bisa menyetujui request L4 (403)', gmApprove.status === 403)
  const rej = await owner.post(`/api/access-requests/${r4.request_id}/reject`, { note: 'Minta ringkasan ke PIC saja' })
  const mine = await staf.get('/access?tab=mine')
  t.check('Penolakan menampilkan alasan ke pemohon', decodeLoc(rej.location).includes('ditolak') && mine.text.includes('Minta ringkasan ke PIC saja'))

  // Kedaluwarsa
  await sql()`update access_requests set expires_at = now() - interval '1 minute' where request_id = ${r3.request_id}`
  await sql()`update permissions set expires_at = now() - interval '1 minute' where source = 'ACCESS_REQUEST'`
  const cron = await new Client().get('/api/cron/expire-access', { authorization: 'Bearer smoke-cron' })
  const after = await staf.getJson(`/api/files/${l3}`)
  const [st] = await sql()<{ status: string }[]>`select status from access_requests where request_id = ${r3.request_id}`
  t.check('Setelah expires_at lewat (cron), staf kembali ACCESS_DENIED; status EXPIRED', cron.status === 200 && after.status === 403 && st.status === 'EXPIRED')

  // Scenario 3
  const gmOpen = await gm.get(`/api/files/${flagged}`)
  const [auto] = await sql()<{ approver_role: string; auto_created: boolean; requested_action: string }[]>`select approver_role, auto_created, requested_action from access_requests where document_id = ${flagged}`
  t.check('GM membuka dokumen wajib persetujuan Owner → request ke Owner otomatis, file tidak dibuka',
    gmOpen.status === 303 && decodeLoc(gmOpen.location).includes('sudah dikirim ke Owner') && auto?.approver_role === 'OWNER' && auto.auto_created)
  const ownerPage = await owner.get('/access')
  t.check('Owner melihat permintaan otomatis berlabel "Otomatis"', ownerPage.text.includes('Akta Perubahan Direksi') && ownerPage.text.includes('Otomatis'))
  const nav = await owner.get('/')
  t.check('Sidebar Persetujuan menampilkan jumlah menunggu', /Persetujuan<\/span><span class="nav-count">1</.test(nav.text))

  t.check('Semua langkah tercatat (REQUESTED/APPROVED/REJECTED/EXPIRED)',
    (await auditCount('APPROVAL_REQUESTED')) >= 3 && (await auditCount('ACCESS_APPROVED', { result: 'SUCCESS' })) === 1 &&
    (await auditCount('ACCESS_REJECTED', { result: 'SUCCESS' })) === 1 && (await auditCount('ACCESS_EXPIRED')) === 1)
}
