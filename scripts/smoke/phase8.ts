import { Client, Smoke, auditCount, createDoc, decodeLoc, divisionIdByName, inviteAndLogin, sql, OWNER_EMAIL } from './lib'

export default async function phase8(t: Smoke) {
  const owner = new Client('owner')
  await owner.loginGoogle(OWNER_EMAIL)
  const legal = (await divisionIdByName('Legal/Perizinan'))!
  const pic = await inviteAndLogin(owner, { email: 'pic@drmetz.test', name: 'Rina PIC', roleId: 'DIVISION_USER', divisionId: legal })
  const staf = await inviteAndLogin(owner, { email: 'staf@drmetz.test', name: 'Staf', roleId: 'DIVISION_USER', divisionId: legal })
  const gm = await inviteAndLogin(owner, { email: 'gm@drmetz.test', name: 'GM', roleId: 'GM' })
  const [picRow] = await sql()<{ user_id: string }[]>`select user_id from users where email = 'pic@drmetz.test'`
  await sql()`insert into dev_drive_files (container_id, file_id, name, mime_type, content) values
    ('mock-terbatas-08', 'SMOKEPDF0001', 'Kontrak Laser AEVIA.pdf', 'application/pdf', ${Buffer.from('%PDF-1.4 isi kontrak rahasia')}),
    ('mock-terbatas-08', 'SMOKEGDOC001', 'Memo Direksi', 'application/vnd.google-apps.document', null)`
  const l4 = await createDoc(owner, { documentName: 'Kontrak Laser AEVIA', securityLevel: '4', divisionId: legal, picUserId: picRow.user_id, externalUrl: 'https://drive.google.com/file/d/SMOKEPDF0001/view' })
  const l3 = await createDoc(owner, { documentName: 'Memo Direksi', securityLevel: '3', divisionId: legal, picUserId: picRow.user_id, externalUrl: 'https://drive.google.com/file/d/SMOKEGDOC001/view' })

  const detail = await pic.get(`/documents/${l4}`)
  t.check('PIC melihat tombol "Buka lewat CSSE" (bukan tautan Drive)', detail.text.includes(`/api/files/${l4}`) && !detail.text.includes('drive.google.com/file/d/SMOKEPDF0001'))
  const open = await pic.get(`/api/files/${l4}`)
  t.check('PIC membuka file L4 lewat CSSE (PDF inline, no-store)',
    open.status === 200 && open.headers.get('content-type') === 'application/pdf' && open.text.includes('isi kontrak rahasia') &&
    open.headers.get('content-disposition')!.startsWith('inline') && open.headers.get('cache-control')!.includes('no-store'))
  const ownerDl = await owner.get(`/api/files/${l4}?download=1`)
  t.check('Owner mengunduh file (attachment)', ownerDl.status === 200 && ownerDl.headers.get('content-disposition')!.startsWith('attachment'))

  const gmTry = await gm.get(`/api/files/${l4}`)
  const stafTry = await staf.getJson(`/api/files/${l3}`)
  t.check('GM pada L4 & staf pada L3 → ditolak (tidak ada bypass via ID)', gmTry.status === 303 && decodeLoc(gmTry.location).includes('Akses ditolak') && stafTry.status === 403)
  const anon = await new Client().get(`/api/files/${l4}`)
  t.check('Tanpa sesi → diarahkan ke login', anon.status === 303 && anon.location!.includes('/login'))

  const gdoc = await owner.get(`/api/files/${l3}`)
  t.check('Dokumen Google native tersaji sebagai PDF', gdoc.status === 200 && gdoc.headers.get('content-type') === 'application/pdf' && gdoc.headers.get('content-disposition')!.includes('Memo%20Direksi.pdf'))

  t.check('Setiap buka/unduh tercatat (DOCUMENT_OPENED / DOCUMENT_DOWNLOADED)',
    (await auditCount('DOCUMENT_OPENED', { result: 'SUCCESS' })) === 2 && (await auditCount('DOCUMENT_DOWNLOADED', { result: 'SUCCESS' })) === 1)
  const hist = await owner.get(`/documents/${l4}`)
  t.check('Riwayat dokumen menampilkan siapa membuka', hist.text.includes('Dibuka') && hist.text.includes('Rina PIC'))
}
