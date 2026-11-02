import { setBranchPin } from '@/server/services/orders'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params, body }) => setBranchPin(ctx, params.id, body), {
  onSuccess: '/orders/branches',
  successMessage: (b) => `PIN cabang ${b.branchName} disimpan.`,
})
