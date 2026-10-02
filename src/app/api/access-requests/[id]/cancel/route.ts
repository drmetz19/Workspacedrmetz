import { cancelAccessRequest } from '@/server/services/access'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params }) => cancelAccessRequest(ctx, params.id), {
  onSuccess: '/access?tab=mine',
  successMessage: 'Permintaan dibatalkan.',
})
