import { setOwnerApprovalRequired } from '@/server/services/permissions'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params, body }) => {
  await setOwnerApprovalRequired(ctx, params.id, body.required)
  return { documentId: params.id }
}, { onSuccess: (r) => `/documents/${r.documentId}`, successMessage: 'Pengaturan persetujuan Owner disimpan.' })
