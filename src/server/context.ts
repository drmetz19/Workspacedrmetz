export type RoleId = 'OWNER' | 'GM' | 'DIVISION_USER'
export type Source = 'UI' | 'API' | 'AI' | 'SYSTEM'

/** Identitas terautentikasi yang wajib diterima setiap fungsi service (kontrak MCP-ready). */
export interface IdentityContext {
  userId: string
  email: string
  name: string
  roleId: RoleId
  divisionId: string | null
  source: Source
}

export const isOwner = (ctx: IdentityContext) => ctx.roleId === 'OWNER'
export const isGm = (ctx: IdentityContext) => ctx.roleId === 'GM'
