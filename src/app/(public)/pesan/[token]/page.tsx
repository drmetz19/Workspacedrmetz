import { getPublicBranch } from '@/server/services/orders'
import { OrderForm } from '@/components/OrderForm'
import { Icon } from '@/components/Icon'

export default async function PublicOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const branch = await getPublicBranch(token)
  if (!branch) {
    return (
      <div className="card">
        <h2>Link tidak valid</h2>
        <p className="muted">Link formulir ini salah atau sudah diganti. Minta link terbaru kepada PSCM.</p>
      </div>
    )
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Surat Pesanan Barang</h1>
          <p>Cabang <strong>{branch.branchName}</strong> → PSCM. Isi barang yang dibutuhkan, lalu kirim.</p>
        </div>
        <a className="btn" href={`/pesan/${token}/terima`}><Icon name="inventory_2" /> Catat barang masuk / keluar</a>
      </div>
      {branch.ready ? (
        <OrderForm mode="public" token={token} branchName={branch.branchName} />
      ) : (
        <div className="card">
          <h2>Formulir belum aktif</h2>
          <p className="muted">PIN cabang {branch.branchName} belum diatur. Hubungi PSCM.</p>
        </div>
      )}
    </>
  )
}
