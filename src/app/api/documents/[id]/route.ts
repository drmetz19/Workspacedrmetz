import { getDocumentMetadata, updateDocumentMetadata } from '@/server/services/documents'
import { handler } from '@/server/http'

export const GET = handler(async ({ ctx, params }) => getDocumentMetadata(ctx, params.id))

export const POST = handler(async ({ ctx, body, params }) => updateDocumentMetadata(ctx, params.id, body), {
  onSuccess: (d) => `/documents/${d.documentId}`,
  successMessage: 'Metadata disimpan.',
})
