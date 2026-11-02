import Link from 'next/link'
import { requireUser, sp, type SearchParams } from '@/lib/session'
import { isProcurement, listBranchOptions, listOrders } from '@/server/services/orders'
import { Flash } from '@/components/Flash'
import { Icon } from '@/components/Icon'
import { OrderStatusBadge } from '@/components/OrderStatusBadge'
import { fmtDate } from '@/lib/labels'
import { ORDER_SOURCE } from '@/lib/order-labels'

const TABS = [
  { key: 'OPEN', label: 'Berjalan' },
  { key: 'MENUNGGU', label: 'Menunggu PSCM' },
  { key: 'SEBAGIAN_DITERIMA', label: 'Sebagian diterima' },
  { key: 'DITERIMA', label: 'Selesai' },
  { key: 'ALL', label: 'Semua' },
] as const

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const status = TABS.find((t) => t.key === get('status'))?.key ?? 'OPEN'
  const branchId = get('branch') || undefined
  const [orders, procurement, branches] = await Promise.all([listOrders(user, { status, branchId }), isProcurement(user), listBranchOptions(user)])
  const href = (over: Record<string, string | null>) => {
    const p = new URLSearchParams()
    const cur: Record<string, string | null> = { status: status === 'OPEN' ? null : status, branch: branchId ?? null, ...over }
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v)
    const s = p.toString()
    return `/orders${s ? `?${s}` : ''}`
  }

  return (
    <>
      <Flash msg={get('msg')} err={get('err')} />
      <div className="page-head">
        <div>
          <h1>Pesanan Barang</h1>
          <p>{procurement ? 'Surat Pesanan dari semua cabang. Setujui, cetak, dan pantau barang masuk/keluar.' : 'Pesanan barang yang Anda buat.'}</p>
        </div>
        <div className="row">
          {procurement && <Link className="btn" href="/orders/branches"><Icon name="qr_code_2" /> Cabang &amp; Link Formulir</Link>}
          <Link className="btn btn-primary" href="/orders/new"><Icon name="add" /> Buat Pesanan</Link>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => <Link key={t.key} href={href({ status: t.key === 'OPEN' ? null : t.key })} className={`tab${status === t.key ? ' active' : ''}`}>{t.label}</Link>)}
      </div>
      {procurement && branches.length > 1 && (
        <div className="chips-row" style={{ margin: '10px 0' }}>
          <Link className={`chip${!branchId ? ' active' : ''}`} href={href({ branch: null })}>Semua cabang</Link>
          {branches.map((b) => <Link key={b.branchId} className={`chip${branchId === b.branchId ? ' active' : ''}`} href={href({ branch: b.branchId })}>{b.branchName}</Link>)}
        </div>
      )}
      <div className="card">
        {orders.length === 0 ? (
          <div className="empty">Belum ada pesanan pada filter ini.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>No. Surat Pesanan</th><th>Cabang</th><th>Pemesan</th><th>Barang</th><th>Dibutuhkan</th><th>Status</th><th>Masuk</th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.poId}>
                    <td><Link href={`/orders/${o.poId}`}><strong>{o.poNumber}</strong></Link></td>
                    <td>{o.branchName}</td>
                    <td>{o.requesterName}<div className="small muted">{ORDER_SOURCE[o.source]}</div></td>
                    <td>{o.itemCount} item</td>
                    <td>{fmtDate(o.neededDate)}</td>
                    <td><OrderStatusBadge status={o.status} /></td>
                    <td className="small muted">{fmtDate(o.createdAt)}</td>
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
