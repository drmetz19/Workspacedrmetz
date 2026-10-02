import type { Sql, Tx } from '../db'
import type { Grant } from './engine'

type GrantRow = {
  resource_id: string
  permission_type: Grant['permissionType']
  principal_type: Grant['principalType']
  principal_id: string
  expires_at: Date | null
  revoked_at: Date | null
}

const toGrant = (r: GrantRow): Grant => ({
  permissionType: r.permission_type,
  principalType: r.principal_type,
  principalId: r.principal_id,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
})

/** Grant aktif (belum dicabut) untuk satu dokumen. Kedaluwarsa dievaluasi oleh engine. */
export async function loadGrants(q: Sql | Tx, documentId: string): Promise<Grant[]> {
  const rows = await q<GrantRow[]>`
    select resource_id, permission_type, principal_type, principal_id, expires_at, revoked_at
    from permissions where resource_type = 'DOCUMENT' and resource_id = ${documentId} and revoked_at is null`
  return rows.map(toGrant)
}

export async function loadGrantsFor(q: Sql | Tx, documentIds: string[]): Promise<Map<string, Grant[]>> {
  const map = new Map<string, Grant[]>()
  if (!documentIds.length) return map
  const rows = await q<GrantRow[]>`
    select resource_id, permission_type, principal_type, principal_id, expires_at, revoked_at
    from permissions where resource_type = 'DOCUMENT' and resource_id = any(${documentIds}::uuid[]) and revoked_at is null`
  for (const r of rows) {
    const list = map.get(r.resource_id) ?? []
    list.push(toGrant(r))
    map.set(r.resource_id, list)
  }
  return map
}
