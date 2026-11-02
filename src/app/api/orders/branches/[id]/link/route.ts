import { regenerateBranchLink } from '@/server/services/orders'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params }) => regenerateBranchLink(ctx, params.id), {
  onSuccess: '/orders/branches',
  successMessage: (b) => `Link formulir ${b.branchName} diganti. Link lama tidak berlaku lagi.`,
})
