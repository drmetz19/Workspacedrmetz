import { updateBranch } from '@/server/services/orders'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params, body }) => updateBranch(ctx, params.id, body), {
  onSuccess: '/orders/branches',
  successMessage: (b) => `Cabang ${b.branchName} diperbarui.`,
})
