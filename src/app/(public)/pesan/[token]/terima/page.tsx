import { getPublicBranch } from '@/server/services/orders'
import { PublicReceive } from '@/components/PublicReceive'
import { Icon } from '@/components/Icon'

export default async function PublicReceivePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const branch = await getPublicBranch(token)
  if (!branch) {
    return (
      <div className="card">
        <h2>Link tidak valid</h2>
        <p className="muted">Link ini salah atau sudah diganti. Minta link terbaru kepada PSCM.</p>
      </div>
    )
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Barang Masuk / Keluar</h1>
          <p>Cabang <strong>{branch.branchName}</strong>. Catat barang yang diterima atau dikirim untuk pesanan yang sudah disetujui PSCM.</p>
        </div>
        <a className="btn" href={`/pesan/${token}`}><Icon name="arrow_back" /> Kembali ke form pesanan</a>
      </div>
      {branch.ready ? (
        <PublicReceive token={token} branchName={branch.branchName} />
      ) : (
        <div className="card">
          <h2>Belum aktif</h2>
          <p className="muted">PIN cabang belum diatur. Hubungi PSCM.</p>
        </div>
      )}
    </>
  )
}
