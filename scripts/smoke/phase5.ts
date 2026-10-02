import { Client, Smoke, categoryIdByName, createDoc, divisionIdByName, inviteAndLogin, sql, OWNER_EMAIL } from './lib'

export default async function phase5(t: Smoke) {
  const owner = new Client('owner')
  await owner.loginGoogle(OWNER_EMAIL)
  const legal = (await divisionIdByName('Legal/Perizinan'))!
  await owner.post('/api/admin/divisions', { divisionName: 'HR' })
  const hrDiv = (await divisionIdByName('HR'))!
  const pic = await inviteAndLogin(owner, { email: 'pic@drmetz.test', name: 'Rina PIC', roleId: 'DIVISION_USER', divisionId: legal })
  const hr = await inviteAndLogin(owner, { email: 'hr@drmetz.test', name: 'Staf HR', roleId: 'DIVISION_USER', divisionId: hrDiv })
  const [picRow] = await sql()<{ user_id: string }[]>`select user_id from users where email = 'pic@drmetz.test'`
  const izin = (await categoryIdByName('Izin Operasional'))!
  const kontrak = (await categoryIdByName('Kontrak'))!
  let n = 0
  const url = () => `https://drive.google.com/file/d/SMK5FILE${++n}xyz/view`

  const v1 = await createDoc(owner, { documentName: 'Izin Operasional Klinik Jakarta 2024', categoryId: izin, divisionId: legal, picUserId: picRow.user_id, securityLevel: '2', expiryDate: '2026-11-30', externalUrl: url() })
  const v2 = await createDoc(owner, { documentName: 'Izin Operasional Klinik Jakarta 2026', categoryId: izin, divisionId: legal, picUserId: picRow.user_id, securityLevel: '2', expiryDate: '2031-01-01', externalUrl: url(), supersedesDocumentId: v1 })
  await createDoc(owner, { documentName: 'Izin Operasional Klinik Surabaya', categoryId: izin, divisionId: legal, securityLevel: '2', expiryDate: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10), externalUrl: url() })
  await createDoc(owner, { documentName: 'Kontrak Vendor Laser Jakarta', categoryId: kontrak, divisionId: legal, picUserId: picRow.user_id, securityLevel: '3', externalUrl: url() })
  await createDoc(owner, { documentName: 'Laporan Eksekutif Jakarta', categoryId: kontrak, divisionId: hrDiv, securityLevel: '5', externalUrl: url() })

  const page = await owner.get('/search?q=izin+jakarta')
  t.check('Halaman pencarian tampil dengan form filter & hasil', page.status === 200 && page.text.includes('Kata kunci') && page.text.includes('Izin Operasional Klinik Jakarta 2026'))

  const combo = await owner.getJson(`/api/search?q=izin&categoryId=${izin}&divisionId=${legal}&securityLevel=2&status=ALL`)
  const names = combo.json().data.results.map((d: { documentName: string }) => d.documentName)
  t.check('Kombinasi filter (kata kunci + kategori + divisi + level + status) benar', names.length === 3 && names.every((x: string) => x.startsWith('Izin')), JSON.stringify(names))

  const versions = await owner.getJson('/api/search?q=jakarta+20&status=ALL')
  const vr = versions.json().data.results
  t.check('Versi ACTIVE di urutan teratas, SUPERSEDED sesudahnya', vr[0].documentId === v2 && vr[1].documentId === v1 && vr[1].status === 'SUPERSEDED')
  const vpage = await owner.get('/search?q=jakarta+20&status=ALL')
  t.check('Versi lama berlabel "Tidak berlaku" dengan tautan ke versi aktif', vpage.text.includes('Tidak berlaku') && vpage.text.includes('lihat versi aktif'))

  const soon = await owner.getJson('/api/search?expiry=within30')
  t.check('Filter kedaluwarsa ≤30 hari', soon.json().data.results.length === 1 && soon.json().data.results[0].documentName === 'Izin Operasional Klinik Surabaya')
  const byPic = await owner.getJson(`/api/search?picUserId=${picRow.user_id}`)
  t.check('Filter PIC', byPic.json().data.results.length === 2)

  const asOwner = await owner.getJson('/api/search?q=jakarta')
  const asHr = await hr.getJson('/api/search?q=jakarta')
  const asPic = await pic.getJson('/api/search?q=jakarta')
  t.check('Query sama, hasil berbeda sesuai izin (Owner 3 · PIC 2 · HR 0)',
    asOwner.json().data.results.length === 3 && asPic.json().data.results.length === 2 && asHr.json().data.results.length === 0,
    `${asOwner.json().data.results.length}/${asPic.json().data.results.length}/${asHr.json().data.results.length}`)
  t.check('Response API menyertakan permission_scope_applied: true', asHr.json().data.permission_scope_applied === true)

  const sidebar = await owner.get('/')
  t.check('Sidebar menampilkan daftar divisi yang menuju pencarian per divisi', sidebar.text.includes(`/search?divisionId=${legal}`))
  const divPage = await owner.get(`/search?divisionId=${legal}`)
  t.check('Halaman per divisi menampilkan dokumen divisi tsb', divPage.text.includes('Divisi Legal/Perizinan') && divPage.text.includes('Kontrak Vendor Laser') && !divPage.text.includes('Laporan Eksekutif'))
  const bad = await owner.getJson('/api/search?securityLevel=9')
  t.check('Filter tidak valid → 400', bad.status === 400)
}
