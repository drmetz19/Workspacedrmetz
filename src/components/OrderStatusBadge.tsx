import { ORDER_STATUS } from '@/lib/order-labels'

export function OrderStatusBadge({ status }: { status: string }) {
  const [label, cls] = ORDER_STATUS[status] ?? [status, 'badge-muted']
  return <span className={`badge ${cls}`}>{label}</span>
}
