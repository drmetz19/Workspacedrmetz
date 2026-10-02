import { listDecidedRequests, listMyRequests, listPendingApprovals, requestDocumentAccess } from '@/server/services/access'
import { handler } from '@/server/http'

/** GET ?scope=pending (default) | mine | decided */
export const GET = handler(async ({ ctx, body }) =>
  body.scope === 'mine' ? listMyRequests(ctx) : body.scope === 'decided' ? listDecidedRequests(ctx) : listPendingApprovals(ctx),
)

export const POST = handler(async ({ ctx, body }) => requestDocumentAccess(ctx, body.documentId, { reason: body.reason, requestedAction: body.requestedAction }), {
  onSuccess: (r) => `/documents/${r.documentId}`,
  successMessage: (r) => `Permintaan akses terkirim ke ${r.approverRole === 'OWNER' ? 'Owner' : 'GM/Owner'}.`,
})
