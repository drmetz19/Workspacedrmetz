import { recordMovement } from '@/server/services/orders'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params, body }) => recordMovement(ctx, params.id, body), {
  onSuccess: (o) => `/orders/${o.poId}`,
  successMessage: 'Pencatatan barang tersimpan.',
})
