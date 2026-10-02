import { BASE, Client, Smoke, addDriveFile, auditCount, categoryIdByName, decodeLoc, divisionIdByName, inviteAndLogin, sql, OWNER_EMAIL } from './lib'

export default async function phase6(t: Smoke) {
  const owner = new Client('owner')
  await owner.loginGoogle(OWNER_EMAIL)
  const legal = (await divisionIdByName('Legal/Perizinan'))!
  const staf = await inviteAndLogin(owner, { email: 'staf@drmetz.test', name: 'Staf Legal', roleId: 'DIVISION_USER', divisionId: legal })

  await addDriveFile('mock-legal-01', 'DF1', 'Izin_Operasional_Klinik_Jakarta_exp_2027-03-31.pdf')
  await addDriveFile('mock-legal-01', 'DF2', 'MoU RS Mitra Sehat.pdf')
  await addDriveFile('mock-legal-01', 'DF3', 'SIP dr Sarah.pdf')
  await addDriveFile('mock-rahasia-01', 'DR1', 'Kontrak Vendor Laser AEVIA.pdf')

  const page = await owner.get('/admin/sources')
  t.check('Halaman Sumber Drive tampil dengan instruksi berbagi ke akun CSSE', page.status === 200 && page.text.includes('csse-mock@drive.local'))

  const c1 = await owner.post('/api/sources', { folder: 'https://drive.google.com/drive/folders/mock-legal-01', containerKind: 'FOLDER', sourceType: 'STANDARD', defaultDivisionId: legal, name: 'Legal – Perizinan' })
  const c2 = await owner.post('/api/sources', { folder: 'mock-rahasia-01', containerKind: 'FOLDER', sourceType: 'RESTRICTED', defaultDivisionId: legal, name: 'Legal – Terbatas' })
  t.check('Owner menghubungkan folder standar & terbatas', decodeLoc(c1.location).includes('terhubung') && decodeLoc(c2.location).includes('terhubung'), decodeLoc(c1.location))
  const bad = await owner.post('/api/sources', { folder: 'https://drive.google.com/drive/folders/1TidakDibagikanKeCSSE', sourceType: 'STANDARD' })
  t.check('Folder yang tidak dibagikan → pesan "Bagikan folder ke …"', decodeLoc(bad.location).includes('Bagikan folder ke'), decodeLoc(bad.location))
  const [s1] = await sql()<{ source_id: string }[]>`select source_id from drive_sources where external_id = 'mock-legal-01'`
  const [s2] = await sql()<{ source_id: string }[]>`select source_id from drive_sources where external_id = 'mock-rahasia-01'`

  const scan1 = await owner.post(`/api/sources/${s1.source_id}/scan`)
  t.check('Scan pertama: 3 file → 3 draft', decodeLoc(scan1.location).includes('3 file, 3 draft baru'), decodeLoc(scan1.location))
  const scan2 = await owner.post(`/api/sources/${s1.source_id}/scan`)
  t.check('Scan kedua tanpa perubahan: 0 draft baru', decodeLoc(scan2.location).includes('0 draft baru, 3 sudah terdaftar'), decodeLoc(scan2.location))
  const status = await owner.get('/admin/sources')
  t.check('Status sinkronisasi tampil (scan terakhir & terhubung)', status.text.includes('Terhubung') && status.text.includes('3 file'))

  await owner.post(`/api/sources/${s2.source_id}/scan`)
  const [r1] = await sql()<{ security_level: number; status: string }[]>`select security_level, status from documents where external_resource_id = 'DR1'`
  t.check('File folder terbatas → draft level ≥ L3', r1.status === 'DRAFT' && r1.security_level >= 3)

  const searchBefore = await owner.getJson('/api/search?q=izin')
  t.check('Draft belum muncul di pencarian', searchBefore.json().data.results.length === 0)
  const queue = await owner.get('/documents/review')
  t.check('Antrean review menampilkan 4 draft dengan saran kategori', queue.text.includes('Izin Operasional Klinik Jakarta') && queue.text.includes('saran') && new Set(queue.text.match(/\/documents\/review\/[0-9a-f-]{36}/g) ?? []).size === 4)
  const stafQueue = await staf.get('/documents/review')
  t.check('Staf tanpa tugas tidak melihat draft', stafQueue.text.includes('Tidak ada draft'))

  const [draft] = await sql()<{ document_id: string }[]>`select document_id from documents where external_resource_id = 'DF1'`
  const form = await owner.get(`/documents/review/${draft.document_id}`)
  t.check('Form review terisi dari saran (bertanda "Saran")', form.text.includes('Saran') && form.text.includes('2027-03-31'))
  const izin = (await categoryIdByName('Izin Operasional'))!
  const conf = await owner.post(`/api/documents/${draft.document_id}/confirm`, { documentName: 'Izin Operasional Klinik Jakarta', categoryId: izin, divisionId: legal, securityLevel: '2', expiryDate: '2027-03-31' })
  t.check('Konfirmasi draft → aktif', decodeLoc(conf.location).includes('dikonfirmasi'), decodeLoc(conf.location))
  const searchAfter = await owner.getJson('/api/search?q=izin')
  t.check('Setelah dikonfirmasi, dokumen muncul di pencarian', searchAfter.json().data.results.length === 1)
  t.check('Konfirmasi diaudit (DOCUMENT_CONFIRMED)', (await auditCount('DOCUMENT_CONFIRMED')) === 1)

  const [rest] = await sql()<{ document_id: string }[]>`select document_id from documents where external_resource_id = 'DR1'`
  const low = await owner.post(`/api/documents/${rest.document_id}/confirm`, { documentName: 'Kontrak Vendor Laser', securityLevel: '2' })
  t.check('Draft folder terbatas tidak bisa dikonfirmasi di bawah L3', decodeLoc(low.location).includes('minimal L3'), decodeLoc(low.location))

  // File hilang
  await sql()`update dev_drive_files set trashed = true where file_id = 'DF1'`
  const scan3 = await owner.post(`/api/sources/${s1.source_id}/scan`)
  const detail = await owner.get(`/documents/${draft.document_id}`)
  t.check('File dihapus di Drive → record ditandai "Sumber hilang", tidak dihapus', decodeLoc(scan3.location).includes('1 file hilang') && detail.status === 200 && detail.text.includes('Sumber hilang'))

  // Cron
  const noAuth = await new Client().get('/api/cron/scan')
  const cron = await new Client().get('/api/cron/scan', { authorization: 'Bearer smoke-cron' })
  t.check('Cron scan harian: tanpa secret 401, dengan secret berjalan untuk semua sumber', noAuth.status === 401 && cron.status === 200 && cron.json().data.length === 2)
  const topbar = await owner.get('/')
  t.check('Topbar menampilkan "Drive Terhubung"', topbar.text.includes('Drive Terhubung'))
  void BASE
}
