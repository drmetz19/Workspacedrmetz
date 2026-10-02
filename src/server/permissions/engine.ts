import type { IdentityContext } from '../context'

/**
 * PERMISSION ENGINE — sumber keputusan akses CSSE. Murni & deterministik (tidak pernah lewat LLM).
 *
 * Kebijakan level (PRD · Kebijakan level keamanan):
 * | Level | Boleh TAHU dokumen ada            | Boleh BUKA                          | Cara buka   | Approver request |
 * | L1    | semua user                        | semua user                          | Drive       | —                |
 * | L2    | divisi terkait + GM + Owner + PIC | sama                                | Drive       | —                |
 * | L3    | divisi terkait + GM + Owner + PIC | PIC + GM + Owner                    | lewat CSSE  | GM atau Owner    |
 * | L4    | GM + Owner + PIC                  | Owner + PIC                         | lewat CSSE  | Owner            |
 * | L5    | Owner                             | Owner                               | lewat CSSE  | Owner            |
 * + grant eksplisit aktif menambah hak di atas default.
 * + OWNER_APPROVAL_REQUIRED: GM kehilangan hak default buka/ubah; approver selalu Owner.
 * + DRAFT/REJECTED: hanya Owner, GM, PIC (antrean review).
 *
 * Fungsi SQL `csse_can_view_document` adalah cermin `canView` — paritas diuji di tests/phase4-permissions.test.ts.
 */

export type PermissionType = 'VIEW' | 'OPEN' | 'DOWNLOAD' | 'EDIT_METADATA' | 'MANAGE_PERMISSION' | 'APPROVE'
export type Action = 'VIEW' | 'OPEN' | 'EDIT_METADATA' | 'ARCHIVE' | 'CHANGE_LEVEL' | 'MANAGE_PERMISSION'

export interface DocFacts {
  documentId: string
  securityLevel: number
  divisionId: string | null
  picUserId: string | null
  ownerApprovalRequired: boolean
  status: string
}

export interface Grant {
  permissionType: PermissionType
  principalType: 'USER' | 'ROLE' | 'DIVISION'
  principalId: string
  expiresAt: Date | null
  revokedAt?: Date | null
}

export type Approver = 'GM' | 'OWNER'

export interface Decision {
  allowed: boolean
  /** Kode alasan untuk audit/UI. */
  reason: string
  /** User boleh tahu dokumen ada tetapi belum boleh aksi ini → bisa mengajukan permintaan akses. */
  requestable: boolean
  approver: Approver | null
}

const isOwner = (c: IdentityContext) => c.roleId === 'OWNER'
const isGm = (c: IdentityContext) => c.roleId === 'GM'
const isPic = (c: IdentityContext, d: DocFacts) => !!d.picUserId && d.picUserId === c.userId
const inDivision = (c: IdentityContext, d: DocFacts) => !!c.divisionId && d.divisionId === c.divisionId

/** Grant yang berlaku untuk user ini (aktif, belum dicabut, belum kedaluwarsa). */
export function applicableGrants(ctx: IdentityContext, grants: Grant[], now = new Date()): Set<PermissionType> {
  const out = new Set<PermissionType>()
  for (const g of grants) {
    if (g.revokedAt) continue
    if (g.expiresAt && g.expiresAt <= now) continue
    const match =
      (g.principalType === 'USER' && g.principalId === ctx.userId) ||
      (g.principalType === 'ROLE' && g.principalId === ctx.roleId) ||
      (g.principalType === 'DIVISION' && !!ctx.divisionId && g.principalId === ctx.divisionId)
    if (match) out.add(g.permissionType)
  }
  return out
}

/** Siapa yang menyetujui permintaan akses dokumen ini. */
export function approverFor(d: DocFacts): Approver {
  if (d.ownerApprovalRequired || d.securityLevel >= 4) return 'OWNER'
  return 'GM'
}

/**
 * Cara membuka: L1–2 langsung di Drive, L3–5 hanya lewat CSSE.
 * Mode tautan (DRIVE_PROVIDER=link): semua level lewat tautan Drive — izin file dijaga setelan berbagi Drive.
 */
export const openMode = (d: DocFacts): 'DRIVE' | 'CSSE' =>
  process.env.DRIVE_PROVIDER === 'link' || d.securityLevel <= 2 ? 'DRIVE' : 'CSSE'

export function canView(ctx: IdentityContext, d: DocFacts, grants: Grant[] = [], now = new Date()): boolean {
  if (isOwner(ctx)) return true
  if (d.status === 'DRAFT' || d.status === 'REJECTED') return isGm(ctx) || isPic(ctx, d)
  const g = applicableGrants(ctx, grants, now)
  if (g.has('VIEW') || g.has('OPEN') || g.has('DOWNLOAD') || g.has('EDIT_METADATA')) return true
  switch (d.securityLevel) {
    case 1:
      return true
    case 2:
    case 3:
      return isGm(ctx) || isPic(ctx, d) || inDivision(ctx, d)
    case 4:
      return isGm(ctx) || isPic(ctx, d)
    default:
      return false
  }
}

function defaultCanOpen(ctx: IdentityContext, d: DocFacts): boolean {
  if (isOwner(ctx)) return true
  const gmOk = isGm(ctx) && !d.ownerApprovalRequired
  switch (d.securityLevel) {
    case 1:
      return true
    case 2:
      return gmOk || isPic(ctx, d) || inDivision(ctx, d)
    case 3:
      return gmOk || isPic(ctx, d)
    case 4:
      return isPic(ctx, d)
    default:
      return false
  }
}

export function decide(ctx: IdentityContext, d: DocFacts, action: Action, grants: Grant[] = [], now = new Date()): Decision {
  const view = canView(ctx, d, grants, now)
  const g = applicableGrants(ctx, grants, now)
  const deny = (reason: string, requestable = false): Decision => ({ allowed: false, reason, requestable, approver: requestable ? approverFor(d) : null })
  const allow = (reason: string): Decision => ({ allowed: true, reason, requestable: false, approver: null })

  if (!view) return deny('NOT_VISIBLE')
  switch (action) {
    case 'VIEW':
      return allow('VISIBLE')
    case 'OPEN': {
      if (d.status === 'DRAFT' || d.status === 'REJECTED') return isOwner(ctx) || isPic(ctx, d) || isGm(ctx) ? allow('DRAFT_REVIEWER') : deny('DRAFT')
      if (defaultCanOpen(ctx, d)) return allow('LEVEL_POLICY')
      if (g.has('OPEN') || g.has('DOWNLOAD')) return allow('EXPLICIT_GRANT')
      return deny(isGm(ctx) && d.ownerApprovalRequired ? 'OWNER_APPROVAL_REQUIRED' : 'LEVEL_POLICY', d.securityLevel >= 3)
    }
    case 'EDIT_METADATA': {
      if (isOwner(ctx)) return allow('OWNER')
      if (g.has('EDIT_METADATA')) return allow('EXPLICIT_GRANT')
      if (isGm(ctx)) return d.ownerApprovalRequired ? deny('OWNER_APPROVAL_REQUIRED', true) : allow('GM')
      if (isPic(ctx, d)) return allow('PIC')
      return deny('NOT_EDITOR')
    }
    case 'ARCHIVE':
    case 'CHANGE_LEVEL':
    case 'MANAGE_PERMISSION':
      return isOwner(ctx) ? allow('OWNER') : deny('OWNER_ONLY')
  }
}

export const canOpen = (ctx: IdentityContext, d: DocFacts, grants: Grant[] = [], now = new Date()) => decide(ctx, d, 'OPEN', grants, now).allowed
export const canEditMetadata = (ctx: IdentityContext, d: DocFacts, grants: Grant[] = [], now = new Date()) => decide(ctx, d, 'EDIT_METADATA', grants, now).allowed
export const canArchive = (ctx: IdentityContext, d: DocFacts) => decide(ctx, d, 'ARCHIVE').allowed

/** Level maksimum yang boleh dipilih saat mendaftarkan dokumen (agar pembuat tidak "mengunci diri"). */
export function maxLevelOnCreate(ctx: IdentityContext): number {
  if (isOwner(ctx)) return 5
  if (isGm(ctx)) return 4
  return 3
}

export function canCreateIn(ctx: IdentityContext, divisionId: string | null): boolean {
  if (isOwner(ctx) || isGm(ctx)) return true
  return !!ctx.divisionId && divisionId === ctx.divisionId
}
