import { createDocumentRecord, listDocuments } from '@/server/services/documents'
import { handler } from '@/server/http'

export const GET = handler(async ({ ctx, body }) =>
  listDocuments(ctx, {
    status: (body.status as 'ACTIVE' | 'INACTIVE' | 'ALL') ?? 'ACTIVE',
    scope: (body.scope as 'all' | 'mine' | 'division') ?? 'all',
  }),
)

export const POST = handler(async ({ ctx, body }) => createDocumentRecord(ctx, body), {
  onSuccess: (d) => `/documents/${d.documentId}`,
  successMessage: 'Dokumen terdaftar.',
})
