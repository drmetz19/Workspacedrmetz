import { createBranch } from '@/server/services/orders'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, body }) => createBranch(ctx, body), {
  onSuccess: '/orders/branches',
  successMessage: (b) => `Cabang ${b.branchName} dibuat. Atur PIN agar formulirnya bisa dipakai.`,
})
