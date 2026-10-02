import { Client, Smoke, auditCount, categoryIdByName, createDoc, divisionIdByName, inviteAndLogin, sql, OWNER_EMAIL } from './lib'

export default async function phase10(t: Smoke) {
  const owner = new Client('owner')
  await owner.loginGoogle(OWNER_EMAIL)
  const legal = (await divisionIdByName('Legal/Perizinan'))!
  await owner.post('/api/admin/divisions', { divisionName: 'HR' })
  const hr = await inviteAndLogin(owner, { email: 'hr@drmetz.test', name: 'Staf HR', roleId: 'DIVISION_USER', divisionId: (await divisionIdByName('HR'))! })
  const izin = (await categoryIdByName('Izin Operasional'))!
  let n = 0
  const url = () => `https://drive.google.com/file/d/SMK10FILE${++n}xyz/view`
  const v1 = await createDoc(owner, { documentName: 'Izin Operasional Klinik Jakarta 2020', categoryId: izin, divisionId: legal, securityLevel: '2', expiryDate: '2025-01-01', externalUrl: url() })
  const v2 = await createDoc(owner, { documentName: 'Izin Operasional Klinik Jakarta 2025', categoryId: izin, divisionId: legal, securityLevel: '2', expiryDate: '2030-01-10', externalUrl: url(), supersedesDocumentId: v1 })
  await createDoc(owner, { documentName: 'Laporan Keuangan Eksekutif Finance', divisionId: legal, securityLevel: '5', confirmedSummary: 'Laba bersih rahasia', externalUrl: url() })

  const page = await owner.get('/search/ask')
  t.check('Halaman Tanya AI tampil dengan contoh pertanyaan', page.status === 200 && page.text.includes('Contoh pertanyaan'))
  const ans = await owner.get('/search/ask?q=' + encodeURIComponent('Cari izin operasional klinik Jakarta terbaru'))
  t.check('Jawaban mengutip dokumen ACTIVE dengan sitasi yang bisa diklik', ans.text.includes(`href="/documents/${v2}"`) && ans.text.includes('class="cite"') && ans.text.includes('Izin Operasional Klinik Jakarta 2025'))
  const api = await owner.postJson('/api/ask', { question: 'izin operasional jakarta terbaru' })
  t.check('API /api/ask → sitasi pertama = versi aktif, permissionScopeApplied', api.status === 200 && api.json().data.citations[0].documentId === v2 && api.json().data.permissionScopeApplied === true)

  const leak = await hr.get('/search/ask?q=' + encodeURIComponent('berapa laba bersih di laporan keuangan eksekutif?'))
  t.check('User HR bertanya dokumen Executive → tidak menemukan, tanpa petunjuk isi', leak.text.includes('tidak menemukan') && !leak.text.includes('Laba bersih rahasia') && !/Laporan Keuangan Eksekutif Finance/.test(leak.text.replace(/value="[^"]*"/g, '')))

  const none = await owner.get('/search/ask?q=' + encodeURIComponent('sertifikat halal dapur Bali'))
  t.check('Tanpa hasil → menyatakan tidak menemukan & menawarkan pencarian filter', none.text.includes('tidak menemukan') && none.text.includes('Coba pencarian filter'))

  await sql()`insert into dev_flags (key, value) values ('MOCK_AI_FAIL', '1')`
  const down = await owner.get('/search/ask?q=' + encodeURIComponent('izin jakarta'))
  const filter = await owner.getJson('/api/search?q=izin+jakarta')
  t.check('Provider AI mati → "AI sementara tidak tersedia", pencarian filter tetap jalan', down.text.includes('AI sementara tidak tersedia') && filter.json().data.results.length === 1)
  await sql()`delete from dev_flags where key = 'MOCK_AI_FAIL'`

  t.check('Setiap query tercatat di audit', (await auditCount('AI_DOCUMENT_QUERIED')) === 5)
}
