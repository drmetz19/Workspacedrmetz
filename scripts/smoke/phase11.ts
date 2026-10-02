import { Client, Smoke, createDoc, divisionIdByName, inviteAndLogin, sql, OWNER_EMAIL } from './lib'

const plus = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10)

export default async function phase11(t: Smoke) {
  const owner = new Client('owner')
  await owner.loginGoogle(OWNER_EMAIL)
  const legal = (await divisionIdByName('Legal/Perizinan'))!
  const pic = await inviteAndLogin(owner, { email: 'pic@drmetz.test', name: 'Rina PIC', roleId: 'DIVISION_USER', divisionId: legal })
  const staf = await inviteAndLogin(owner, { email: 'staf@drmetz.test', name: 'Budi Staf', roleId: 'DIVISION_USER', divisionId: legal })
  const gm = await inviteAndLogin(owner, { email: 'gm@drmetz.test', name: 'Hendra GM', roleId: 'GM' })
  const [picRow] = await sql()<{ user_id: string }[]>`select user_id from users where email = 'pic@drmetz.test'`
  await owner.post(`/api/admin/divisions/${legal}`, { divisionName: 'Legal/Perizinan', status: 'ACTIVE', managerUserId: picRow.user_id })
  let n = 0
  const url = () => `https://drive.google.com/file/d/SMK11FILE${++n}xyz/view`
  const d60 = await createDoc(owner, { documentName: 'SIP dr Sarah', divisionId: legal, picUserId: picRow.user_id, securityLevel: '2', expiryDate: plus(60), externalUrl: url() })
  await createDoc(owner, { documentName: 'Sewa Gedung Blok M', divisionId: legal, picUserId: picRow.user_id, securityLevel: '2', expiryDate: plus(120), externalUrl: url() })
  await createDoc(owner, { documentName: 'Akta Rahasia Direksi', divisionId: legal, securityLevel: '5', expiryDate: plus(20), externalUrl: url() })
  const l3 = await createDoc(owner, { documentName: 'Kontrak Vendor Laser', divisionId: legal, picUserId: picRow.user_id, securityLevel: '3', externalUrl: url() })
  await staf.post('/api/access-requests', { documentId: l3, reason: 'Perlu untuk audit internal' })

  const home = await owner.get('/')
  t.check('Owner melihat kartu Perlu Tindakan, Akan Kedaluwarsa, Google Drive', ['Perlu tindakan', 'Akan kedaluwarsa', 'Google Drive'].every((s) => home.text.includes(s)))
  t.check('Angka kartu sesuai data (1 item tindakan, 2 dokumen ≤90 hari)', home.text.includes('1 Item') && home.text.includes('2 Dokumen'), '')
  const urgent = home.text.slice(home.text.indexOf('Dokumen Perlu Perhatian Segera'), home.text.indexOf('Aktivitas Terbaru'))
  t.check('Dokumen kedaluwarsa 60 hari muncul; 120 hari tidak', urgent.includes('SIP dr Sarah') && /Expiry (59|60) hari/.test(urgent) && !urgent.includes('Sewa Gedung Blok M'))
  t.check('Kartu divisi menampilkan jumlah dokumen & penanggung jawab', home.text.includes('Divisi Legal/Perizinan') && home.text.includes('4 Dokumen') && home.text.includes('Rina PIC'))
  t.check('Aktivitas Terbaru & Aktivitas Terbatas tampil', home.text.includes('Aktivitas Terbaru') && home.text.includes('Aktivitas Terbatas'))
  t.check('Item kartu tertaut ke halaman terkait', home.text.includes(`href="/documents/${d60}"`) && home.text.includes('href="/access"'))

  const gmHome = await gm.get('/')
  t.check('GM tidak melihat dokumen L5 di Command Center', !gmHome.text.includes('Akta Rahasia Direksi') && gmHome.text.includes('SIP dr Sarah'))

  const picHome = await pic.get('/')
  t.check('PIC (Division User) melihat dashboard pribadinya: dokumen PIC akan kedaluwarsa', picHome.text.includes('Dokumen saya akan kedaluwarsa') && picHome.text.includes('SIP dr Sarah') && !picHome.text.includes('Aktivitas Terbatas'))
  const stafHome = await staf.get('/')
  t.check('Staf melihat permintaan aksesnya', stafHome.text.includes('Permintaan akses saya') && stafHome.text.includes('Kontrak Vendor Laser') && !stafHome.text.includes('SIP dr Sarah'))
  t.check('Bar Tanya AI ada di Command Center', home.text.includes('Tanya Dokumen via CSSE AI Assistant'))
}
