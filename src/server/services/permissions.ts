import { z } from 'zod'
import { db } from '../db'
import { auditAs } from '../audit'
import { ServiceError } from '../errors'
import type { IdentityContext } from '../context'
import { optionalText, parseInput, requireUuid } from '../validation'
import { decide } from '../permissions/engine'
import { facts, loadVisibleDocument } from './documents'

async function requireManage(ctx: IdentityContext, documentId: unknown, attempted: string) {
  const row = await loadVisibleDocument(ctx, documentId, attempted)
  if (!decide(ctx, facts(row), 'MANAGE_PERMISSION').allowed) {
    await auditAs(ctx, { action: 'PERMISSION_CHANGED', resourceType: 'DOCUMENT', resourceId: row.document_id, result: 'DENIED', metadata: { attempted } })
    throw new ServiceError('ACCESS_DENIED', 'Hanya Owner yang dapat mengatur izin dan level keamanan.')
  }
  return row
}

// ── Level keamanan ──────────────────────────────────────────────────────
export async function changeSecurityLevel(ctx: IdentityContext, documentId: unknown, level: unknown) {
  const row = await requireManage(ctx, documentId, 'CHANGE_LEVEL')
  const to = parseInput(z.coerce.number().int().min(1).max(5), level)
  if (to === row.security_level) return
  await db().begin(async (tx) => {
    await tx`update documents set security_level = ${to}, updated_at = now() where document_id = ${row.document_id}`
    await auditAs(ctx, {
      action: 'PERMISSION_CHANGED', resourceType: 'DOCUMENT', resourceId: row.document_id, result: 'SUCCESS',
      metadata: { kind: 'SECURITY_LEVEL', from: row.security_level, to },
    }, tx)
  })
  return { from: row.security_level, to, needsRestrictedStorage: to >= 3 && row.security_level <= 2 }
}

export async function setOwnerApprovalRequired(ctx: IdentityContext, documentId: unknown, required: unknown) {
  const row = await requireManage(ctx, documentId, 'OWNER_APPROVAL_FLAG')
  const value = required === true || required === 'true' || required === 'on' || required === '1'
  if (value === row.owner_approval_required) return
  await db().begin(async (tx) => {
    await tx`update documents set owner_approval_required = ${value}, updated_at = now() where document_id = ${row.document_id}`
    await auditAs(ctx, {
      action: 'PERMISSION_CHANGED', resourceType: 'DOCUMENT', resourceId: row.document_id, result: 'SUCCESS',
      metadata: { kind: 'OWNER_APPROVAL_REQUIRED', to: value },
    }, tx)
  })
}

// ── Grant eksplisit ─────────────────────────────────────────────────────
const GrantInput = z.object({
  principalType: z.enum(['USER', 'ROLE', 'DIVISION']),
  principalId: z.string().trim().min(1, 'wajib dipilih'),
  permissionType: z.enum(['VIEW', 'OPEN', 'EDIT_METADATA']),
  expiresAt: z
    .string()
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null))
    .refine((v) => v === null || !Number.isNaN(Date.parse(v)), 'tanggal tidak valid'),
  reason: optionalText,
})

export interface PermissionDto {
  permissionId: string
  principalType: 'USER' | 'ROLE' | 'DIVISION'
  principalId: string
  principalLabel: string
  permissionType: string
  grantedByName: string | null
  source: string
  reason: string | null
  createdAt: Date
  expiresAt: Date | null
  active: boolean
}

export async function grantDocumentPermission(ctx: IdentityContext, documentId: unknown, input: unknown): Promise<PermissionDto> {
  const row = await requireManage(ctx, documentId, 'GRANT')
  const data = parseInput(GrantInput, input)
  // Validasi principal
  if (data.principalType === 'USER') {
    requireUuid(data.principalId, 'User')
    if (!(await db()`select 1 from users where user_id = ${data.principalId} and status <> 'DEACTIVATED'`).length)
      throw new ServiceError('VALIDATION', 'principalId: user tidak ditemukan')
  } else if (data.principalType === 'DIVISION') {
    requireUuid(data.principalId, 'Divisi')
    if (!(await db()`select 1 from divisions where division_id = ${data.principalId}`).length)
      throw new ServiceError('VALIDATION', 'principalId: divisi tidak ditemukan')
  } else if (!['GM', 'DIVISION_USER'].includes(data.principalId)) {
    throw new ServiceError('VALIDATION', 'principalId: role tidak valid')
  }
  const expiresAt = data.expiresAt ? new Date(data.expiresAt.length === 10 ? `${data.expiresAt}T23:59:59+07:00` : data.expiresAt) : null
  if (expiresAt && expiresAt <= new Date()) throw new ServiceError('VALIDATION', 'expiresAt: harus di masa depan')
  const id = await db().begin(async (tx) => {
    const [g] = await tx<{ permission_id: string }[]>`
      insert into permissions (resource_type, resource_id, principal_type, principal_id, permission_type, granted_by, reason, expires_at)
      values ('DOCUMENT', ${row.document_id}, ${data.principalType}, ${data.principalId}, ${data.permissionType}, ${ctx.userId}, ${data.reason}, ${expiresAt})
      returning permission_id`
    await auditAs(ctx, {
      action: 'PERMISSION_CHANGED', resourceType: 'DOCUMENT', resourceId: row.document_id, result: 'SUCCESS',
      metadata: { kind: 'GRANT', permissionId: g.permission_id, principalType: data.principalType, principalId: data.principalId, permissionType: data.permissionType, expiresAt },
    }, tx)
    return g.permission_id
  })
  return (await listDocumentPermissions(ctx, row.document_id)).find((p) => p.permissionId === id)!
}

export async function revokeDocumentPermission(ctx: IdentityContext, documentId: unknown, permissionId: unknown) {
  const row = await requireManage(ctx, documentId, 'REVOKE')
  const pid = requireUuid(permissionId, 'Izin')
  const [g] = await db()`update permissions set revoked_at = now(), revoked_by = ${ctx.userId}
    where permission_id = ${pid} and resource_id = ${row.document_id} and revoked_at is null returning permission_id, principal_type, principal_id, permission_type`
  if (!g) throw new ServiceError('NOT_FOUND', 'Izin tidak ditemukan.')
  await auditAs(ctx, {
    action: 'PERMISSION_CHANGED', resourceType: 'DOCUMENT', resourceId: row.document_id, result: 'SUCCESS',
    metadata: { kind: 'REVOKE', permissionId: pid, principalType: g.principal_type, principalId: g.principal_id, permissionType: g.permission_type },
  })
}

export async function listDocumentPermissions(ctx: IdentityContext, documentId: unknown): Promise<PermissionDto[]> {
  const row = await requireManage(ctx, documentId, 'LIST_PERMISSIONS')
  const rows = await db()<{
    permission_id: string; principal_type: 'USER' | 'ROLE' | 'DIVISION'; principal_id: string; permission_type: string
    granted_by_name: string | null; source: string; reason: string | null; created_at: Date; expires_at: Date | null
    user_name: string | null; user_email: string | null; division_name: string | null
  }[]>`
    select p.*, gb.name as granted_by_name, u.name as user_name, u.email as user_email, d.division_name
    from permissions p
    left join users gb on gb.user_id = p.granted_by
    left join users u on p.principal_type = 'USER' and u.user_id::text = p.principal_id
    left join divisions d on p.principal_type = 'DIVISION' and d.division_id::text = p.principal_id
    where p.resource_type = 'DOCUMENT' and p.resource_id = ${row.document_id} and p.revoked_at is null
    order by p.created_at desc`
  const ROLE: Record<string, string> = { GM: 'Semua GM', DIVISION_USER: 'Semua Division User' }
  return rows.map((r) => ({
    permissionId: r.permission_id,
    principalType: r.principal_type,
    principalId: r.principal_id,
    principalLabel: r.principal_type === 'USER' ? `${r.user_name} (${r.user_email})` : r.principal_type === 'DIVISION' ? `Divisi ${r.division_name}` : ROLE[r.principal_id] ?? r.principal_id,
    permissionType: r.permission_type,
    grantedByName: r.granted_by_name,
    source: r.source,
    reason: r.reason,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    active: !r.expires_at || r.expires_at > new Date(),
  }))
}
