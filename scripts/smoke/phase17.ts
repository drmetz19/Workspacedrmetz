import { Client, Smoke, auditCount, decodeLoc, divisionIdByName, inviteAndLogin, sql, BASE, OWNER_EMAIL } from './lib'

export default async function phase17(t: Smoke) {
  const owner = new Client('owner')
  await owner.loginGoogle(OWNER_EMAIL)
  const legal = (await divisionIdByName('Legal/Perizinan'))!
  await owner.post('/api/admin/divisions', { divisionName: 'Keuangan' })
  const keu = (await divisionIdByName('Keuangan'))!
  const staf = await inviteAndLogin(owner, { email: 'staf@drmetz.test', name: 'Staf Legal', roleId: 'DIVISION_USER', divisionId: legal })
  const [stafRow] = await sql()<{ user_id: string }[]>`select user_id from users where email = 'staf@drmetz.test'`

  const form = await staf.get('/meetings/new')
  t.check('Form "Buat Notulensi Rapat Baru" tampil', form.status === 200 && form.text.includes('Buat Notulensi Rapat Baru') && form.text.includes('name="summary"'))

  const created = await staf.post('/api/meetings', {
    title: 'Rapat Perpanjangan Izin Klinik', divisionId: legal, meetingDate: '2026-10-01', meetingType: 'INTERNAL', status: 'DISAHKAN',
    attendees: 'dr. Metz, Staf Legal', summary: 'Membahas perpanjangan izin operasional klinik utama.', driveUrl: 'https://drive.google.com/file/d/1NotulenIzin/view',
  })
  const minutesId = created.location?.match(/\/meetings\/([0-9a-f-]{36})/)?.[1]
  t.check('Simpan notulensi → redirect ke halaman detail + audit', created.status === 303 && !!minutesId && (await auditCount('MEETING_MINUTES_CREATED', { result: 'SUCCESS' })) === 1, decodeLoc(created.location))

  const detail = await staf.get(`/meetings/${minutesId}`)
  t.check('Detail: ringkasan, peserta, tautan Drive, form tindak lanjut', ['Ringkasan Pembahasan', 'Peserta Rapat', 'dr. Metz', '1NotulenIzin', 'Tambah Tindak Lanjut'].every((s) => detail.text.includes(s)))

  const add = await staf.post('/api/action-items', { minutesId: minutesId!, returnTo: `/meetings/${minutesId}`, description: 'Kirim berkas perpanjangan ke dinas', picUserId: stafRow.user_id, dueDate: '' })
  t.check('Tambah tindak lanjut → tetap di halaman detail notulensi', add.status === 303 && add.location?.startsWith(`${BASE}/meetings/${minutesId}`) === true, add.location ?? '')
  const [item] = await sql()<{ action_item_id: string }[]>`select action_item_id from meeting_action_items where minutes_id = ${minutesId!}`
  const after = await staf.get(`/meetings/${minutesId}`)
  t.check('Butir tindak lanjut tampil di detail', after.text.includes('Kirim berkas perpanjangan ke dinas'))

  const st = await staf.post(`/api/action-items/${item.action_item_id}/status`, { status: 'SELESAI', returnTo: `/meetings/${minutesId}` })
  const [row] = await sql()<{ status: string }[]>`select status from meeting_action_items where action_item_id = ${item.action_item_id}`
  t.check('Ubah status → SELESAI + audit', st.status === 303 && row.status === 'SELESAI' && (await auditCount('ACTION_ITEM_STATUS_CHANGED', { result: 'SUCCESS' })) === 1)

  await owner.post('/api/meetings', { title: 'Rapat Anggaran Keuangan', divisionId: keu, meetingDate: '2026-10-02', summary: 'Anggaran Q4.' })
  const [keuRow] = await sql()<{ minutes_id: string }[]>`select minutes_id from meeting_minutes where division_id = ${keu}`

  const list = await owner.get('/meetings')
  t.check('Owner: daftar memuat notulensi semua divisi + kartu statistik', list.text.includes('Notulensi Rapat &amp; Tindak Lanjut') && list.text.includes('Rapat Perpanjangan Izin Klinik') && list.text.includes('Rapat Anggaran Keuangan'))

  const sList = await staf.get('/meetings')
  t.check('Staf: daftar hanya notulensi divisinya', sList.text.includes('Rapat Perpanjangan Izin Klinik') && !sList.text.includes('Rapat Anggaran Keuangan'))
  const sKeu = await staf.get(`/meetings/${keuRow.minutes_id}`)
  t.check('Staf membuka notulensi divisi lain → ditolak', !sKeu.text.includes('Anggaran Q4.') && (await auditCount('ACCESS_DENIED', { result: 'DENIED' })) >= 1)
  const sCreate = await staf.post('/api/meetings', { title: 'Rapat Keuangan Palsu', divisionId: keu, meetingDate: '2026-10-03', summary: 'Tidak boleh.' })
  t.check('Staf membuat notulensi divisi lain → ditolak dengan pesan', sCreate.status === 303 && decodeLoc(sCreate.location).includes('divisi Anda sendiri'))

  const api = await staf.getJson('/api/meetings')
  const apiTitles = (api.json().data as { title: string }[]).map((m) => m.title)
  t.check('API /api/meetings (JSON) dibatasi scope', api.status === 200 && apiTitles.length === 1 && apiTitles[0] === 'Rapat Perpanjangan Izin Klinik')

  const home = await owner.get('/')
  t.check('Command Center: panel Notulensi Rapat & Tindak Lanjut', home.text.includes('Notulensi Rapat &amp; Tindak Lanjut') && home.text.includes('Rapat Anggaran Keuangan'))
}
