import { searchDocuments } from '@/server/services/search'
import { handler } from '@/server/http'

/** GET /api/search?q=&categoryId=&divisionId=&picUserId=&securityLevel=3&securityLevel=4&status=&expiry=&expiryFrom=&expiryTo= */
export const GET = handler(async ({ ctx, req }) => {
  const p = req.nextUrl.searchParams
  const input: Record<string, string | string[]> = {}
  for (const key of new Set(p.keys())) {
    const all = p.getAll(key)
    input[key] = key === 'securityLevel' ? all : all[0]
  }
  const r = await searchDocuments(ctx, input)
  return { results: r.results, total: r.total, permissionScopeApplied: r.permissionScopeApplied, permission_scope_applied: true }
})
