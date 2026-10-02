import { archiveDocument } from '@/server/services/documents'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params }) => {
  await archiveDocument(ctx, params.id)
  return { documentId: params.id }
}, { onSuccess: (r) => `/documents/${r.documentId}`, successMessage: 'Dokumen diarsipkan.' })
