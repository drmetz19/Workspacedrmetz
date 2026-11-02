import { cancelOrder } from '@/server/services/orders'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params }) => cancelOrder(ctx, params.id), {
  onSuccess: (o) => `/orders/${o.poId}`,
  successMessage: (o) => `Pesanan ${o.poNumber} dibatalkan.`,
})
