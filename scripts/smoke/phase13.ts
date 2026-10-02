import { Client, Smoke, auditCount, createDoc, decodeLoc, divisionIdByName, inviteAndLogin, sql, OWNER_EMAIL } from './lib'

/** Server dijalankan dengan Drive mode tautan (tanpa akun service, tanpa scan). */
export const serverEnv = { DRIVE_PROVIDER: 'link' }

const L4_URL = 'https://drive.google.com/file/d/1SmokeLinkL4File/view?usp=sharing'
const FOLDER_URL = 'https://drive.google.com/drive/folders/1SmokeFolderSIP'

export default async function phase13(t: Smoke) {
  const owner = new Client('owner')
  await owner.loginGoogle(OWNER_EMAIL)
  const legal = (await divisionIdByName('Legal/Perizinan'))!
  const pic = await inviteAndLogin(owner, { email: 'pic@drmetz.test', name: 'Rina PIC', roleId: 'DIVISION_USER', divisionId: legal })
  const staf = await inviteAndLogin(owner, { email: 'staf@drmetz.test', name: 'Staf', roleId: 'DIVISION_USER', divisionId: legal })
  const [picRow] = await sql()<{ user_id: string }[]>`select user_id from users where email = 'pic@drmetz.test'`

  const l4 = await createDoc(owner, { documentName: 'Kontrak Laser AEVIA', securityLevel: '4', divisionId: legal, picUserId: picRow.user_id, externalUrl: L4_URL })
  const folderDoc = await createDoc(owner, { documentName: 'Arsip SIP Dokter', securityLevel: '2', divisionId: legal, externalUrl: FOLDER_URL })
  const [f] = await sql()<{ external_url: string }[]>`select external_url from documents where document_id = ${folderDoc}`
  t.check('Tautan folder Drive diterima sebagai lokasi dokumen', f?.external_url === FOLDER_URL)

  const detail = await pic.get(`/documents/${l4}`)
  t.check('Detail L4 untuk PIC: tombol "Buka di Google Drive" (bukan proxy CSSE)',
    detail.text.includes(`/api/documents/${l4}/open-drive`) && !detail.text.includes(`/api/files/${l4}`) && detail.text.includes('setelan berbagi Drive'))

  const open = await pic.get(`/api/documents/${l4}/open-drive`)
  t.check('PIC membuka L4 → redirect ke tautan Drive', open.status === 303 && open.location === L4_URL)
  t.check('Pembukaan tercatat di audit (via DRIVE_LINK)', (await auditCount('DOCUMENT_OPENED', { result: 'SUCCESS' })) === 1)

  const denied = await staf.get(`/api/documents/${l4}/open-drive`)
  t.check('Staf tanpa hak → ditolak CSSE, tautan tidak diberikan', denied.status === 303 && !denied.location?.includes('drive.google.com') && decodeLoc(denied.location).length > 0)

  const legacy = await pic.get(`/api/files/${l4}`)
  t.check('Link lama /api/files diarahkan ke jalur tautan', legacy.status === 303 && legacy.location!.endsWith(`/api/documents/${l4}/open-drive`))

  const dash = await owner.get('/')
  t.check('Command Center menampilkan "Mode tautan"; menu Sumber Drive disembunyikan', dash.text.includes('Mode tautan') && !dash.text.includes('href="/admin/sources"'))
  const src = await owner.get('/admin/sources')
  t.check('Halaman Sumber Drive menjelaskan mode tautan', src.status === 200 && src.text.includes('mode tautan'))
  const scan = await owner.postJson('/api/sources', { folder: FOLDER_URL, sourceType: 'STANDARD' })
  t.check('Menghubungkan folder untuk scan ditolak dengan pesan jelas', scan.status === 400 && scan.text.includes('tautan'))
}
