import { decideOrder } from '@/server/services/orders'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params, body }) => decideOrder(ctx, params.id, body), {
  onSuccess: (o) => `/orders/${o.poId}`,
  successMessage: (o) => (o.status === 'DISETUJUI' ? `Pesanan ${o.poNumber} disetujui. Surat Pesanan siap dicetak.` : `Pesanan ${o.poNumber} ditolak.`),
})
