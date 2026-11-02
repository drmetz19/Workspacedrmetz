import Link from 'next/link'
import { requireUser } from '@/lib/session'
import { guard } from '@/lib/page-guard'
import { getOrder, isProcurement } from '@/server/services/orders'
import { AccessDenied } from '@/components/AccessDenied'
import { Flash } from '@/components/Flash'
import { Icon } from '@/components/Icon'
import { MovementForm } from '@/components/MovementForm'
import { OrderStatusBadge } from '@/components/OrderStatusBadge'
import { PrintButton } from '@/components/PrintButton'
import { fmtDate, fmtDateTime } from '@/lib/labels'
import { DIRECTION_LABEL, fmtQty, ORDER_SOURCE } from '@/lib/order-labels'

export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const sp = await searchParams
  const result = await guard(() => getOrder(user, id))
  if (!result.ok) return <AccessDenied message={result.message} />
  const o = result.data
  const procurement = await isProcurement(user)
  const items = o.items ?? []
  const issued = ['DISETUJUI', 'SEBAGIAN_DITERIMA', 'DITERIMA'].includes(o.status)
  const canRecord = o.status === 'DISETUJUI' || o.status === 'SEBAGIAN_DITERIMA'

  return (
    <>
      <div className="no-print"><Flash msg={sp.msg} err={sp.err} /></div>
      <div className="crumbs no-print"><Link href="/orders">Pesanan Barang</Link> <Icon name="chevron_right" size={13} /> <span>{o.poNumber}</span></div>
      <div className="page-head no-print">
        <div>
          <h1 className="row" style={{ gap: 10 }}>{o.poNumber} <OrderStatusBadge status={o.status} /></h1>
          <p>{o.branchName} · {o.requesterName} · {ORDER_SOURCE[o.source]} · dibuat {fmtDateTime(o.createdAt)}</p>
        </div>
        <div className="row">
          {issued && <PrintButton label="Cetak Surat Pesanan" />}
          {o.status === 'MENUNGGU' && (
            <form action={`/api/orders/${o.poId}/cancel`} method="post"><button className="btn btn-danger" type="submit">Batalkan</button></form>
          )}
        </div>
      </div>

      {o.status === 'MENUNGGU' && procurement && (
        <form action={`/api/orders/${o.poId}/decision`} method="post" className="card no-print">
          <h2>Keputusan PSCM</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="supplierName">Supplier / vendor (opsional)</label>
              <input id="supplierName" name="supplierName" placeholder="mis. PT Medika Sejahtera" />
            </div>
            <div className="field">
              <label htmlFor="note">Catatan / alasan (wajib bila ditolak)</label>
              <input id="note" name="note" />
            </div>
          </div>
          <div className="row">
            <button className="btn btn-primary" type="submit" name="decision" value="SETUJUI"><Icon name="check" /> Setujui &amp; terbitkan Surat Pesanan</button>
            <button className="btn btn-danger" type="submit" name="decision" value="TOLAK"><Icon name="close" /> Tolak</button>
          </div>
        </form>
      )}
      {o.status === 'DITOLAK' && <div className="flash flash-err no-print">Ditolak{o.decidedByName ? ` oleh ${o.decidedByName}` : ''}: {o.decisionNote}</div>}

      <div className="po-sheet" style={{ marginBottom: 16 }}>
        <h2>SURAT PESANAN</h2>
        <p style={{ textAlign: 'center', margin: '0 0 14px' }}><strong>{o.poNumber}</strong></p>
        <table style={{ marginBottom: 12 }}>
          <tbody>
            <tr><th style={{ width: '24%' }}>Dari cabang</th><td>{o.branchName}</td><th style={{ width: '20%' }}>Tanggal</th><td>{fmtDate(o.createdAt)}</td></tr>
            <tr><th>Kepada</th><td>PSCM (Supply Chain){o.supplierName ? ` · Vendor: ${o.supplierName}` : ''}</td><th>Dibutuhkan</th><td>{fmtDate(o.neededDate)}</td></tr>
            <tr><th>Pemesan</th><td>{o.requesterName}{o.requesterContact ? ` (${o.requesterContact})` : ''}</td><th>Status</th><td>{o.status === 'MENUNGGU' ? 'Menunggu persetujuan' : o.status === 'DITOLAK' ? 'Ditolak' : 'Disetujui'}</td></tr>
          </tbody>
        </table>
        <table>
          <thead><tr><th style={{ width: 40 }}>No</th><th>Nama barang</th><th style={{ width: 90 }}>Jumlah</th><th style={{ width: 70 }}>Satuan</th><th>Catatan</th><th className="no-print" style={{ width: 120 }}>Diterima</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.itemId}>
                <td>{it.lineNo}</td><td>{it.itemName}</td><td>{fmtQty(it.qty)}</td><td>{it.unit}</td><td>{it.note ?? ''}</td>
                <td className="no-print">{fmtQty(it.received)} / {fmtQty(it.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {o.notes && <p style={{ fontSize: 13, marginTop: 10 }}><strong>Catatan:</strong> {o.notes}</p>}
        <div className="po-sign">
          <div>Pemesan<span />({o.requesterName})</div>
          <div>Disetujui PSCM<span />({issued ? o.decidedByName ?? '' : '…………'})</div>
          <div>Penerima barang<span />(…………)</div>
        </div>
      </div>

      {canRecord && (
        <div className="no-print">
          <h2 style={{ margin: '18px 0 8px' }}>Catat barang masuk / keluar</h2>
          <MovementForm mode="app" poId={o.poId} items={items} defaultName={user.name} />
        </div>
      )}

      <div className="card no-print">
        <h2>Riwayat barang masuk / keluar</h2>
        {(o.movements ?? []).length === 0 ? (
          <div className="empty">Belum ada pencatatan.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tanggal</th><th>Jenis</th><th>Barang</th><th>Jumlah</th><th>Pencatat</th><th>Catatan</th></tr></thead>
              <tbody>
                {o.movements!.map((m) => (
                  <tr key={m.movementId}>
                    <td>{fmtDate(m.movedOn)}</td>
                    <td><span className={`badge ${m.direction === 'MASUK' ? 'badge-ok' : 'badge-sky'}`}>{DIRECTION_LABEL[m.direction]}</span></td>
                    <td>{m.itemName}</td><td>{fmtQty(m.qty)} {m.unit}</td>
                    <td>{m.recordedByName}<div className="small muted">{ORDER_SOURCE[m.source]}</div></td>
                    <td className="small">{m.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
