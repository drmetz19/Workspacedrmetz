import { confirmDraft } from '@/server/services/review'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params, body }) => confirmDraft(ctx, params.id, body), {
  onSuccess: '/documents/review',
  successMessage: (d) => `"${d.documentName}" dikonfirmasi dan kini aktif.`,
})
