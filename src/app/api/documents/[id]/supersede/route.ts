import { supersedeDocument } from '@/server/services/documents'
import { handler } from '@/server/http'

/** POST body: oldDocumentId — dokumen [id] menggantikan dokumen lama tersebut. */
export const POST = handler(async ({ ctx, params, body }) => {
  await supersedeDocument(ctx, params.id, body.oldDocumentId)
  return { documentId: params.id }
}, { onSuccess: (r) => `/documents/${r.documentId}`, successMessage: 'Versi tertaut. Dokumen lama kini tidak berlaku.' })
