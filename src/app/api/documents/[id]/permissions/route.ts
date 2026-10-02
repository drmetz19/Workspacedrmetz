import { grantDocumentPermission, listDocumentPermissions } from '@/server/services/permissions'
import { handler } from '@/server/http'

export const GET = handler(async ({ ctx, params }) => listDocumentPermissions(ctx, params.id))

/** Body: principal = "USER:<id>" | "DIVISION:<id>" | "ROLE:GM" (form), atau principalType + principalId (JSON). */
export const POST = handler(async ({ ctx, params, body }) => {
  let { principalType, principalId } = body as Record<string, string | undefined>
  if (typeof body.principal === 'string' && body.principal.includes(':')) {
    ;[principalType, principalId] = body.principal.split(/:(.*)/s)
  }
  await grantDocumentPermission(ctx, params.id, { principalType, principalId, permissionType: body.permissionType, expiresAt: body.expiresAt, reason: body.reason })
  return { documentId: params.id }
}, { onSuccess: (r) => `/documents/${r.documentId}`, successMessage: 'Izin ditambahkan.' })
