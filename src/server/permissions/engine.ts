import type { IdentityContext } from '../context'

/** Fakta dokumen yang dibutuhkan untuk keputusan akses (deterministik, tidak pernah lewat LLM). */
export interface DocFacts {
  documentId: string
  securityLevel: number
  divisionId: string | null
  picUserId: string | null
  ownerApprovalRequired: boolean
  status: string
}

const isOwner = (c: IdentityContext) => c.roleId === 'OWNER'
const isGm = (c: IdentityContext) => c.roleId === 'GM'
const isPic = (c: IdentityContext, d: DocFacts) => !!d.picUserId && d.picUserId === c.userId

/** Phase 3: aturan sementara — Owner/GM semua; Division User dokumen divisinya. (Diganti engine level penuh di Phase 4.) */
export function canView(ctx: IdentityContext, d: DocFacts): boolean {
  if (isOwner(ctx) || isGm(ctx) || isPic(ctx, d)) return true
  return !!ctx.divisionId && d.divisionId === ctx.divisionId
}

export function canEditMetadata(ctx: IdentityContext, d: DocFacts): boolean {
  return isOwner(ctx) || isGm(ctx) || isPic(ctx, d)
}

export function canArchive(ctx: IdentityContext, _d: DocFacts): boolean {
  return isOwner(ctx)
}

export function canCreateIn(ctx: IdentityContext, divisionId: string | null): boolean {
  if (isOwner(ctx) || isGm(ctx)) return true
  return !!ctx.divisionId && divisionId === ctx.divisionId
}
