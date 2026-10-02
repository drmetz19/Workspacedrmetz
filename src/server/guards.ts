import { auditAs } from './audit'
import { ServiceError } from './errors'
import { isOwner, type IdentityContext } from './context'

/** Guard: aksi khusus Owner. Penolakan diaudit dengan action yang dicoba. */
export async function requireOwner(ctx: IdentityContext, action: string, resourceType?: string, resourceId?: string | null) {
  if (isOwner(ctx)) return
  await auditAs(ctx, { action, resourceType, resourceId: resourceId ?? null, result: 'DENIED', metadata: { reason: 'OWNER_ONLY' } })
  throw new ServiceError('ACCESS_DENIED', 'Akses ditolak. Hanya Owner yang dapat melakukan ini.')
}
