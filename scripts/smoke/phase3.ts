import { BASE, Client, Smoke, auditCount, categoryIdByName, createDoc, decodeLoc, divisionIdByName, inviteAndLogin, sql, OWNER_EMAIL } from './lib'

export default async function phase3(t: Smoke) {
  const owner = new Client('owner')
  await owner.loginGoogle(OWNER_EMAIL)
  const legal = (await divisionIdByName('Legal/Perizinan'))!
  const pic = await inviteAndLogin(owner, { email: 'pic@drmetz.test', name: 'Rina PIC', roleId: 'DIVISION_USER', divisionId: legal })
  const [picRow] = await sql()<{ user_id: string }[]>`select user_id from users where email = 'pic@drmetz.test'`
  const izin = (await categoryIdByName('Izin Operasional'))!

  const newPage = await owner.get('/documents/new')
  t.check('Form daftar dokumen tampil', newPage.status === 200 && newPage.text.includes('Daftarkan dokumen') && newPage.text.includes('Izin Operasional'))

  const base = {
    documentName: 'Izin Operasional Klinik Jakarta', documentNumber: '503/IO/2025', categoryId: izin, divisionId: legal,
    picUserId: picRow.user_id, securityLevel: '2', effectiveDate: '2025-01-10', expiryDate: '2026-12-31',
    externalUrl: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view?usp=sharing', confirmedSummary: 'Izin operasional klinik pratama cabang Jakarta.',
  }
  const v1 = await createDoc(owner, base)
  const [row] = await sql()<{ external_resource_id: string; document_id: string }[]>`select * from documents where document_id = ${v1}`
  t.check('Record dibuat dengan document_id internal & Drive file ID terekstrak', row?.external_resource_id === '1AbCdEfGhIjKlMnOpQr')

  const dup = await owner.post('/api/documents', { ...base, documentName: 'Duplikat', externalUrl: 'https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQr' })
  t.check('File Drive yang sama ditolak (duplikat)', decodeLoc(dup.location).includes('sudah terdaftar'), decodeLoc(dup.location))
  const apiDup = await owner.postJson('/api/documents', { ...base, documentName: 'Duplikat' })
  t.check('API duplikat → 409 CONFLICT', apiDup.status === 409)

  const detail = await owner.get(`/documents/${v1}`)
  t.check('Halaman detail menampilkan metadata, PIC, level, status, versi, tanggal',
    detail.status === 200 && ['503/IO/2025', 'Rina PIC', 'Controlled', 'Aktif', 'Versi 1', 'Legal/Perizinan', 'Riwayat'].every((s) => detail.text.includes(s)))

  // Edit oleh PIC
  const ed = await pic.post(`/api/documents/${v1}`, { ...base, documentNumber: '503/IO/2025-R1' })
  t.check('PIC mengubah metadata', decodeLoc(ed.location).includes('Metadata disimpan'), decodeLoc(ed.location))
  const hist = await owner.getJson(`/api/documents/${v1}/history`)
  t.check('Riwayat memuat perubahan (DOCUMENT_UPDATED dengan field yang berubah)',
    hist.json().data[0].action === 'DOCUMENT_UPDATED' && 'documentNumber' in hist.json().data[0].metadata.changes)

  // Versi baru
  const v2 = await createDoc(owner, { ...base, documentNumber: '503/IO/2026', expiryDate: '2031-12-31', externalUrl: 'https://drive.google.com/file/d/2NewVersionFileXyz/view', supersedesDocumentId: v1 })
  const oldDetail = await owner.get(`/documents/${v1}`)
  const newDetail = await owner.get(`/documents/${v2}`)
  t.check('Dokumen lama → "Tidak berlaku" dan menautkan ke versi aktif', oldDetail.text.includes('Tidak berlaku') && oldDetail.text.includes(`/documents/${v2}`))
  t.check('Dokumen baru versi 2 menautkan ke versi lama', newDetail.text.includes('Versi 2') && newDetail.text.includes(`/documents/${v1}`))

  const list = await owner.get('/documents')
  t.check('Daftar aktif hanya menampilkan versi aktif', list.text.includes(`/documents/${v2}`) && !list.text.includes(`/documents/${v1}`))
  const inactive = await owner.get('/documents?tab=inactive')
  t.check('Tab "Arsip & versi lama" menampilkan versi lama', inactive.text.includes(`/documents/${v1}`))

  // Tautkan versi dari halaman detail
  const a = await createDoc(owner, { ...base, documentName: 'Kontrak Sewa Gedung 2024', externalUrl: 'https://drive.google.com/file/d/SewaLama2024abc/view', categoryId: (await categoryIdByName('Sewa'))! })
  const b = await createDoc(owner, { ...base, documentName: 'Kontrak Sewa Gedung 2026', externalUrl: 'https://drive.google.com/file/d/SewaBaru2026abc/view', categoryId: (await categoryIdByName('Sewa'))! })
  const link = await owner.post(`/api/documents/${b}/supersede`, { oldDocumentId: a })
  const [aStatus] = await sql()<{ status: string }[]>`select status from documents where document_id = ${a}`
  t.check('Tautkan versi dari detail: dokumen lama SUPERSEDED', decodeLoc(link.location).includes('Versi tertaut') && aStatus.status === 'SUPERSEDED')

  // Arsip
  const ar = await owner.post(`/api/documents/${b}/archive`)
  const listAfter = await owner.get('/documents')
  t.check('Owner mengarsipkan: dokumen hilang dari daftar aktif', decodeLoc(ar.location).includes('diarsipkan') && !listAfter.text.includes(`/documents/${b}`))
  const picArchive = await pic.postJson(`/api/documents/${v2}/archive`, {})
  t.check('PIC tidak bisa mengarsipkan (403)', picArchive.status === 403)

  t.check('Audit DOCUMENT_CREATED / UPDATED / ARCHIVED tercatat',
    (await auditCount('DOCUMENT_CREATED', { result: 'SUCCESS' })) === 4 && (await auditCount('DOCUMENT_UPDATED', { result: 'SUCCESS' })) === 1 && (await auditCount('DOCUMENT_ARCHIVED', { result: 'SUCCESS' })) === 1)

  // Staf divisi lain tidak bisa melihat
  const fin = await owner.post('/api/admin/divisions', { divisionName: 'Finance' })
  void fin
  const finStaf = await inviteAndLogin(owner, { email: 'fin@drmetz.test', name: 'Staf Fin', roleId: 'DIVISION_USER', divisionId: (await divisionIdByName('Finance'))! })
  const denied = await finStaf.get(`/documents/${v2}`)
  t.check('Staf divisi lain membuka detail → Akses ditolak', denied.text.includes('Akses ditolak'))
  const notFound = await owner.get('/documents/00000000-0000-0000-0000-000000000000')
  t.check('Dokumen tidak ada → 404', notFound.status === 404)
  void BASE
}
