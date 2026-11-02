import { createOrder, listOrders } from '@/server/services/orders'
import { handler } from '@/server/http'

export const GET = handler(async ({ ctx, body }) => listOrders(ctx, { status: body.status as string | undefined, branchId: body.branchId as string | undefined }))

export const POST = handler(async ({ ctx, body }) => createOrder(ctx, body), {
  onSuccess: (o) => `/orders/${o.poId}`,
  successMessage: (o) => `Pesanan ${o.poNumber} terkirim ke PSCM.`,
})
