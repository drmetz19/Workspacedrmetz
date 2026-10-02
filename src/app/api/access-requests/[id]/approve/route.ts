import { approveAccessRequest } from '@/server/services/access'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params, body }) => approveAccessRequest(ctx, params.id, body), {
  onSuccess: '/access',
  successMessage: (r) => `Akses ${r.requesterName} ke "${r.documentName}" disetujui ${r.durationDays} hari.`,
})
