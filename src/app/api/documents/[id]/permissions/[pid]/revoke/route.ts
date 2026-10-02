import { revokeDocumentPermission } from '@/server/services/permissions'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params }) => {
  await revokeDocumentPermission(ctx, params.id, params.pid)
  return { documentId: params.id }
}, { onSuccess: (r) => `/documents/${r.documentId}`, successMessage: 'Izin dicabut.' })
