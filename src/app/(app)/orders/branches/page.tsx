import { headers } from 'next/headers'
import QRCode from 'qrcode'
import { requireUser, sp, type SearchParams } from '@/lib/session'
import { guard } from '@/lib/page-guard'
import { listBranches } from '@/server/services/orders'
import { AccessDenied } from '@/components/AccessDenied'
import { CopyButton } from '@/components/CopyButton'
import { Flash } from '@/components/Flash'

async function origin() {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
  return host ? `${proto}://${host}` : ''
}

export default async function BranchesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const result = await guard(() => listBranches(user))
  if (!result.ok) return <AccessDenied message={result.message} />
  const base = await origin()
  const cards = await Promise.all(result.data.map(async (b) => {
    const url = `${base}/pesan/${b.publicToken}`
    return { b, url, qr: await QRCode.toString(url, { type: 'svg', margin: 1, width: 132 }) }
  }))

  return (
    <>
      <Flash msg={get('msg')} err={get('err')} />
      <div className="page-head">
        <div>
          <h1>Cabang &amp; Link Formulir</h1>
          <p>Tiap cabang punya link/QR formulir sendiri dan PIN. Bagikan link + PIN ke staf cabang; mereka bisa memesan tanpa login.</p>
        </div>
      </div>
      <div className="card">
        <h2>Tambah cabang</h2>
        <form action="/api/orders/branches" method="post" className="row">
          <input name="branchName" placeholder="Nama cabang, mis. Sukabumi" required style={{ maxWidth: 260 }} />
          <input name="branchCode" placeholder="Kode, mis. SKB" required maxLength={6} style={{ maxWidth: 120 }} />
          <button className="btn btn-primary" type="submit">Tambah</button>
        </form>
      </div>
      <div className="grid grid-2">
        {cards.map(({ b, url, qr }) => (
          <div className="card" key={b.branchId}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>{b.branchName} <span className="muted small">({b.branchCode})</span></h2>
              <span className={`badge ${b.status === 'ACTIVE' ? 'badge-ok' : 'badge-muted'}`}>{b.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}</span>
            </div>
            <div className="row" style={{ alignItems: 'flex-start', margin: '12px 0' }}>
              <div className="qr-box" dangerouslySetInnerHTML={{ __html: qr }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="small muted">Link formulir</div>
                <div className="small" style={{ wordBreak: 'break-all' }}>{url}</div>
                <div className="row" style={{ marginTop: 8 }}><CopyButton text={url} /></div>
                <div className="small" style={{ marginTop: 8 }}>
                  PIN: {b.hasPin ? <span className="badge badge-ok">Sudah diatur</span> : <span className="badge badge-warn">Belum diatur — formulir belum aktif</span>}
                  {b.locked && <span className="badge badge-danger" style={{ marginLeft: 6 }}>Terkunci sementara</span>}
                </div>
              </div>
            </div>
            <form action={`/api/orders/branches/${b.branchId}/pin`} method="post" className="row">
              <input name="pin" type="text" placeholder={b.hasPin ? 'PIN baru (4–12 huruf/angka)' : 'Atur PIN (4–12 huruf/angka)'} required minLength={4} maxLength={12} autoComplete="off" style={{ maxWidth: 230 }} />
              <button className="btn btn-sm btn-primary" type="submit">{b.hasPin ? 'Ganti PIN' : 'Simpan PIN'}</button>
            </form>
            <div className="divider" />
            <form action={`/api/orders/branches/${b.branchId}`} method="post" className="row">
              <input name="branchName" defaultValue={b.branchName} required style={{ maxWidth: 180 }} aria-label="Nama cabang" />
              <select name="status" defaultValue={b.status} style={{ maxWidth: 120 }} aria-label="Status">
                <option value="ACTIVE">Aktif</option>
                <option value="INACTIVE">Nonaktif</option>
              </select>
              <button className="btn btn-sm" type="submit">Simpan</button>
            </form>
            <form action={`/api/orders/branches/${b.branchId}/link`} method="post" style={{ marginTop: 8 }}>
              <button className="btn btn-sm btn-warn" type="submit">Ganti link (link lama hangus)</button>
            </form>
          </div>
        ))}
      </div>
    </>
  )
}
