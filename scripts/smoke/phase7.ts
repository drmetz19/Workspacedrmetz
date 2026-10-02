import { Client, Smoke, addDriveFile, decodeLoc, divisionIdByName, inviteAndLogin, sql, OWNER_EMAIL } from './lib'

export default async function phase7(t: Smoke) {
  const owner = new Client('owner')
  await owner.loginGoogle(OWNER_EMAIL)
  const legal = (await divisionIdByName('Legal/Perizinan'))!
  await inviteAndLogin(owner, { email: 'rina@drmetz.test', name: 'Rina', roleId: 'DIVISION_USER', divisionId: legal })

  await addDriveFile('mock-standar-07', 'A1', 'scan_izin_jakarta.pdf',
    'Izin Operasional Klinik Pratama DrMetz Jakarta. Nomor: 503/IO/2025/0182. Ditetapkan tanggal 10-01-2025. Berlaku sampai 10-01-2030. Penanggung jawab: Rina')
  await addDriveFile('mock-standar-07', 'A2', 'foto_sertifikat_akreditasi.jpg', null, 'image/jpeg')
  await addDriveFile('mock-terbatas-07', 'B1', 'PKS Laser AEVIA.pdf', 'PERJANJIAN KERJASAMA. Penalti 5% per minggu. Nilai Rp 1.250.000.000')
  await owner.post('/api/sources', { folder: 'mock-standar-07', sourceType: 'STANDARD', defaultDivisionId: legal })
  await owner.post('/api/sources', { folder: 'mock-terbatas-07', sourceType: 'RESTRICTED', defaultDivisionId: legal })
  for (const s of await sql()<{ source_id: string }[]>`select source_id from drive_sources`) await owner.post(`/api/sources/${s.source_id}/scan`)

  const [a1] = await sql()<{ document_id: string }[]>`select document_id from documents where external_resource_id = 'A1'`
  const form = await owner.get(`/documents/review/${a1.document_id}`)
  t.check('Draft folder standar: saran AI dari isi file (nomor, tanggal, PIC)',
    ['503/IO/2025/0182', '2030-01-10', '2025-01-10', 'membaca isi file'].every((s) => form.text.includes(s)), 'form tidak memuat saran AI')
  t.check('Form review membedakan saran vs field final (label "Saran")', (form.text.match(/>Saran</g) ?? []).length >= 3)

  const [ai] = await sql()<{ input_scope: string; fields: Record<string, unknown> }[]>`
    select s.input_scope, s.fields from document_suggestions s join documents d on d.document_id = s.document_id
    where d.external_resource_id = 'B1' and s.source = 'AI'`
  t.check('Folder terbatas: AI hanya menerima nama file & metadata (tanpa ringkasan isi)', ai?.input_scope === 'FILENAME_METADATA' && !('summary' in ai.fields) && Number(ai.fields.securityLevel) >= 3, JSON.stringify(ai))

  const [a2] = await sql()<{ document_id: string; flag_content_unreadable: boolean }[]>`select document_id, flag_content_unreadable from documents where external_resource_id = 'A2'`
  const queue = await owner.get('/documents/review')
  t.check('Gambar scan → draft dengan tanda "Isi tidak terbaca"', a2.flag_content_unreadable && queue.text.includes('Isi tidak terbaca'))

  const conf = await owner.post(`/api/documents/${a1.document_id}/confirm`, {
    documentName: 'Izin Operasional Klinik Jakarta', documentNumber: '503/IO/2025/0182', securityLevel: '2', expiryDate: '2030-01-10', effectiveDate: '2025-01-10', divisionId: legal,
  })
  const [final] = await sql()<{ status: string; document_number: string; expiry_date: string }[]>`select status, document_number, expiry_date::text from documents where document_id = ${a1.document_id}`
  t.check('Konfirmasi menyalin saran yang disetujui ke field final', decodeLoc(conf.location).includes('dikonfirmasi') && final.status === 'ACTIVE' && final.document_number === '503/IO/2025/0182' && final.expiry_date === '2030-01-10')
}
