import { rejectAccessRequest } from '@/server/services/access'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params, body }) => rejectAccessRequest(ctx, params.id, body), {
  onSuccess: '/access',
  successMessage: (r) => `Permintaan ${r.requesterName} ditolak.`,
})
