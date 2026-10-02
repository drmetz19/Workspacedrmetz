import { Client, Smoke, createDoc, divisionIdByName, inviteAndLogin, sql, OWNER_EMAIL } from './lib'

const addDays = (n: number) => {
  const d = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }))
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export default async function phase15(t: Smoke) {
  const owner = new Client('owner')
  await owner.loginGoogle(OWNER_EMAIL)
  const legal = (await divisionIdByName('Legal/Perizinan'))!
  await owner.post('/api/admin/divisions', { divisionName: 'Keuangan' })
  const keu = (await divisionIdByName('Keuangan'))!
  const staf = await inviteAndLogin(owner, { email: 'staf@drmetz.test', name: 'Staf Legal', roleId: 'DIVISION_USER', divisionId: legal })
  const [ownerRow] = await sql()<{ user_id: string }[]>`select user_id from users where email = ${OWNER_EMAIL}`

  const izin = await createDoc(owner, { documentName: 'Izin Operasional Klinik Utama', documentNumber: '445/8821/DINKES/2025', securityLevel: '2', divisionId: legal, picUserId: ownerRow.user_id, expiryDate: addDays(21), externalUrl: 'https://drive.google.com/file/d/1IzinOpsKlinik01/view' })
  await createDoc(owner, { documentName: 'Laporan Pajak Tahunan', securityLevel: '2', divisionId: keu, effectiveDate: '2026-01-15' })
  const memo = await createDoc(owner, { documentName: 'Memo Rahasia Direksi', documentNumber: 'MEMO/001', securityLevel: '3', divisionId: legal, externalUrl: 'https://drive.google.com/file/d/1MemoRahasiaDir/view' })
  for (let i = 1; i <= 10; i++) await createDoc(owner, { documentName: `SOP Layanan ${String(i).padStart(2, '0')}`, securityLevel: '1', divisionId: legal })

  const all = await owner.get('/documents')
  t.check('Judul "Direktori Dokumen Divisi" + tombol Filter Lanjutan & Unggah/Daftarkan', all.text.includes('Direktori Dokumen Divisi') && all.text.includes('Filter Lanjutan') && all.text.includes('Unggah / Daftarkan Berkas'))
  t.check('Tab divisi dengan jumlah (Semua 13, Legal 12, Keuangan 1)',
    /Semua Divisi\s*<span class="count">13</.test(all.text) && /Legal\/Perizinan\s*<span class="count">12</.test(all.text) && /Keuangan\s*<span class="count">1</.test(all.text))
  t.check('Kolom tabel sesuai mockup', ['Nama dokumen', 'Divisi', 'Penanggung jawab (PIC)', 'Masa berlaku / status', 'Google Drive', 'Aksi'].every((h) => all.text.includes(h)))
  t.check('Paginasi 10 per halaman: "1–10 dari 13"', all.text.includes('Menampilkan 1–10 dari 13') && all.text.includes('page=2'))
  const p2 = await owner.get('/documents?page=2')
  t.check('Halaman 2 menampilkan sisanya (11–13)', p2.text.includes('Menampilkan 11–13 dari 13'))

  const keuTab = await owner.get(`/documents?division=${keu}`)
  t.check('Tab Keuangan hanya dokumen Keuangan', keuTab.text.includes('Laporan Pajak Tahunan') && !keuTab.text.includes('Izin Operasional Klinik Utama'))

  const exp = await owner.get('/documents?status=expiring')
  t.check('Status "Akan berakhir": badge "Berakhir 21 hari lagi" + tombol Perpanjang', exp.text.includes('Berakhir 21 hari lagi') && exp.text.includes(`/documents/new?supersedes=${izin}`) && !exp.text.includes('SOP Layanan'))
  const yr = await owner.get('/documents?year=2026')
  t.check('Filter tahun 2026', yr.text.includes('Laporan Pajak Tahunan') && !yr.text.includes('SOP Layanan 01'))
  const q = await owner.get('/documents?q=pajak')
  t.check('Saring dalam daftar', q.text.includes('Laporan Pajak Tahunan') && !q.text.includes('Izin Operasional Klinik Utama'))
  const izinRow = await owner.get('/documents?q=izin')
  t.check('Kolom Drive: tertaut vs belum ada tautan', all.text.includes('Belum ada tautan') && /Tersinkron|Tertaut/.test(izinRow.text))
  t.check('Owner: tombol Buka Berkas untuk dokumen bertautan', izinRow.text.includes(`/api/documents/${izin}/open-drive`) && izinRow.text.includes('Buka Berkas'))

  const renew = await owner.get(`/documents/new?supersedes=${izin}`)
  t.check('Perpanjang → form versi baru dengan dokumen lama terpilih', renew.text.includes('Perpanjang / versi baru') && new RegExp(`<option value="${izin}" selected`).test(renew.text))

  const sv = await staf.get('/documents')
  t.check('Staf Legal: tab Keuangan tidak muncul (L2 di luar divisinya)', !sv.text.includes('Laporan Pajak Tahunan') && !/Keuangan\s*<span class="count">/.test(sv.text))
  const svMemo = await staf.get('/documents?q=memo')
  t.check('Staf: dokumen L3 tampil "Minta Akses", nomor disembunyikan, tanpa tautan', svMemo.text.includes(`/documents/${memo}#open`) && svMemo.text.includes('Nomor disembunyikan') && !svMemo.text.includes('MEMO/001') && !svMemo.text.includes('1MemoRahasiaDir'))
  const legacy = await owner.get('/documents?tab=inactive')
  t.check('Tautan lama ?tab=inactive tetap berfungsi', legacy.status === 200 && legacy.text.includes('Tidak ada arsip atau versi lama'))
}
