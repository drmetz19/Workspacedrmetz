import { Client, Smoke, auditCount, categoryIdByName, createDoc, decodeLoc, divisionIdByName, inviteAndLogin, sql, OWNER_EMAIL } from './lib'

export default async function phase16(t: Smoke) {
  const owner = new Client('owner')
  await owner.loginGoogle(OWNER_EMAIL)
  const legal = (await divisionIdByName('Legal/Perizinan'))!
  const staf = await inviteAndLogin(owner, { email: 'staf@drmetz.test', name: 'Staf Legal', roleId: 'DIVISION_USER', divisionId: legal })
  const pic = await inviteAndLogin(owner, { email: 'hendra@drmetz.test', name: 'Hendra Wijaya', roleId: 'DIVISION_USER', divisionId: legal })
  void pic
  const [picRow] = await sql()<{ user_id: string }[]>`select user_id from users where email = 'hendra@drmetz.test'`
  const izinCat = (await categoryIdByName('Izin Operasional'))!
  const izin = await createDoc(owner, {
    documentName: 'Izin Operasional Klinik Utama Jakarta Selatan', documentNumber: '445/8821/DINKES-JSL/2025', categoryId: izinCat, divisionId: legal,
    picUserId: picRow.user_id, securityLevel: '2', effectiveDate: '2025-02-01', expiryDate: '2028-02-28', externalUrl: 'https://drive.google.com/file/d/1SmkIzinJkt2025/view',
  })
  const kontrak = await createDoc(owner, { documentName: 'Kontrak Pengadaan Laser AEVIA', documentNumber: 'PKS-AEVIA-2026', divisionId: legal, securityLevel: '3', externalUrl: 'https://drive.google.com/file/d/1SmkKontrakLaser/view' })

  const empty = await owner.get('/search/ask')
  t.check('Halaman "Tanya Dokumen & Regulasi Klinik": badge AI, rekomendasi, Riwayat Chat, Percakapan Baru',
    empty.text.includes('Tanya Dokumen &amp; Regulasi Klinik') && empty.text.includes('CSSE AI aktif') && empty.text.includes('Rekomendasi:') && empty.text.includes('Riwayat Chat') && empty.text.includes('Percakapan Baru'))
  t.check('Panel "Divisi sumber data" dengan jumlah berkas + kartu keamanan + composer bawah',
    empty.text.includes('Divisi sumber data') && /Legal\/Perizinan<\/span><span class="count">2 berkas/.test(empty.text) && empty.text.includes('Jaminan keamanan CSSE') && empty.text.includes('Tanya AI') && empty.text.includes('Tekan Enter untuk bertanya'))

  const question = 'Cari izin operasional klinik Jakarta terbaru'
  const ans = await owner.get('/search/ask?q=' + encodeURIComponent(question))
  t.check('Gelembung pertanyaan user tampil', ans.text.includes(`class="user-text">${question}<`))
  t.check('Kartu "Ditemukan dokumen resmi" + judul dokumen', ans.text.includes('Ditemukan dokumen resmi') && ans.text.includes('Izin Operasional Klinik Utama Jakarta Selatan'))
  t.check('Ringkasan inti: nomor, masa berlaku (sisa), status perpanjangan, penanggung jawab',
    ans.text.includes('445/8821/DINKES-JSL/2025') && ans.text.includes('Masa berlaku:') && ans.text.includes('masih aktif, sisa') && ans.text.includes('Status perpanjangan:') && ans.text.includes('Hendra Wijaya (Legal/Perizinan)'))
  t.check('Tombol "Buka di Google Drive" lewat jalur CSSE (diaudit)', ans.text.includes(`/api/documents/${izin}/open-drive`) && ans.text.includes('Buka di Google Drive'))
  t.check('Jawaban AI dengan sitasi + tombol umpan balik', ans.text.includes('class="cite"') && ans.text.includes('Apakah jawaban ini membantu?') && ans.text.includes('/api/ask/feedback'))

  const fb = await owner.post('/api/ask/feedback', { question, helpful: 'yes', returnTo: '/search/ask?q=' + encodeURIComponent(question) })
  t.check('Umpan balik 👍 → kembali ke percakapan + tercatat audit', fb.status === 303 && fb.location!.includes('/search/ask?q=') && decodeLoc(fb.location).includes('Terima kasih') && (await auditCount('AI_ANSWER_FEEDBACK')) === 1)

  const sAns = await staf.get('/search/ask?q=' + encodeURIComponent('kontrak pengadaan laser aevia'))
  t.check('Staf: dokumen L3 → nomor disembunyikan + tombol "Minta akses", tanpa tautan Drive',
    sAns.text.includes('Disembunyikan — ajukan akses') && sAns.text.includes(`/documents/${kontrak}#open`) && !sAns.text.includes('PKS-AEVIA-2026') && !sAns.text.includes('1SmkKontrakLaser'))

  const hist = await owner.get('/search/ask?history=1')
  t.check('Riwayat chat: pertanyaan Owner tampil, pertanyaan staf tidak', hist.text.includes('Riwayat chat') && hist.text.includes(question) && !hist.text.includes('kontrak pengadaan laser aevia'))
  t.check('Percakapan Baru → halaman kosong dengan contoh pertanyaan', empty.text.includes('href="/search/ask"') && empty.text.includes('Contoh pertanyaan'))
}
