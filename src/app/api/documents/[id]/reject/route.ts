import { rejectDraft } from '@/server/services/review'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params, body }) => rejectDraft(ctx, params.id, body.note), {
  onSuccess: '/documents/review',
  successMessage: 'Draft ditolak dan tidak akan dibuat ulang saat scan berikutnya.',
})
