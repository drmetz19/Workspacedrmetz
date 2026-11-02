import { requireUser, sp, type SearchParams } from '@/lib/session'
import { listBranchOptions } from '@/server/services/orders'
import { OrderForm } from '@/components/OrderForm'
import { Flash } from '@/components/Flash'

export default async function NewOrderPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const branches = await listBranchOptions(user)
  return (
    <>
      <Flash msg={get('msg')} err={get('err')} />
      <div className="page-head">
        <div>
          <h1>Buat Pesanan Barang</h1>
          <p>Pesanan dikirim ke PSCM untuk disetujui, lalu terbit sebagai Surat Pesanan bernomor.</p>
        </div>
      </div>
      <OrderForm mode="app" branches={branches} defaultName={user.name} />
    </>
  )
}
