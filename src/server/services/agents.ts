import { z } from 'zod'
import { db } from '../db'
import { auditAs } from '../audit'
import { ServiceError } from '../errors'
import type { IdentityContext } from '../context'
import { requireOwner } from '../guards'
import { newToken, sha256 } from '../crypto'
import { parseInput, requireUuid } from '../validation'

export const AGENT_TOKEN_PREFIX = 'csse_agent_'

export interface AgentTokenDto {
  tokenId: string
  name: string
  userId: string
  userName: string
  userEmail: string
  roleId: string
  divisionName: string | null
  tokenPrefix: string
  expiresAt: Date
  revokedAt: Date | null
  lastUsedAt: Date | null
  createdAt: Date
  status: 'AKTIF' | 'KEDALUWARSA' | 'DICABUT'
}

type Row = {
  token_id: string; name: string; user_id: string; user_name: string; user_email: string; role_id: string; division_name: string | null
  token_prefix: string; expires_at: Date; revoked_at: Date | null; last_used_at: Date | null; created_at: Date
}

const toDto = (r: Row): AgentTokenDto => ({
  tokenId: r.token_id, name: r.name, userId: r.user_id, userName: r.user_name, userEmail: r.user_email, roleId: r.role_id,
  divisionName: r.division_name, tokenPrefix: r.token_prefix, expiresAt: r.expires_at, revokedAt: r.revoked_at,
  lastUsedAt: r.last_used_at, createdAt: r.created_at,
  status: r.revoked_at ? 'DICABUT' : r.expires_at <= new Date() ? 'KEDALUWARSA' : 'AKTIF',
})

const select = () => db()`
  select t.token_id, t.name, t.user_id, u.name as user_name, u.email as user_email, u.role_id, d.division_name,
    t.token_prefix, t.expires_at, t.revoked_at, t.last_used_at, t.created_at
  from agent_tokens t join users u on u.user_id = t.user_id left join divisions d on d.division_id = u.division_id`

export async function listAgentTokens(ctx: IdentityContext): Promise<AgentTokenDto[]> {
  await requireOwner(ctx, 'AGENT_TOKENS_LISTED', 'AGENT_TOKEN')
  const rows = await db()<Row[]>`${select()} order by t.created_at desc`
  return rows.map(toDto)
}

const CreateInput = z.object({
  name: z.string().trim().min(2, 'minimal 2 karakter').max(60),
  userId: z.string().uuid('pilih user'),
  days: z.coerce.number().int().min(1, 'minimal 1 hari').max(365, 'maksimal 365 hari').default(30),
})

/** Membuat token agent. Token polos dikembalikan SEKALI ini saja; database hanya menyimpan hash-nya. */
export async function createAgentToken(ctx: IdentityContext, input: unknown): Promise<{ token: string; agent: AgentTokenDto }> {
  await requireOwner(ctx, 'AGENT_TOKEN_CREATED', 'AGENT_TOKEN')
  const data = parseInput(CreateInput, input)
  const [u] = await db()<{ user_id: string; status: string }[]>`select user_id, status from users where user_id = ${data.userId}`
  if (!u || u.status !== 'ACTIVE') throw new ServiceError('VALIDATION', 'userId: user harus aktif')
  const token = AGENT_TOKEN_PREFIX + newToken()
  const id = await db().begin(async (tx) => {
    const [r] = await tx<{ token_id: string }[]>`
      insert into agent_tokens (name, user_id, token_hash, token_prefix, expires_at, created_by)
      values (${data.name}, ${data.userId}, ${sha256(token)}, ${token.slice(0, AGENT_TOKEN_PREFIX.length + 6)}, now() + ${data.days} * interval '1 day', ${ctx.userId})
      returning token_id`
    await auditAs(ctx, { action: 'AGENT_TOKEN_CREATED', resourceType: 'AGENT_TOKEN', resourceId: r.token_id, result: 'SUCCESS', metadata: { name: data.name, userId: data.userId, days: data.days } }, tx)
    return r.token_id
  })
  const [row] = await db()<Row[]>`${select()} where t.token_id = ${id}`
  return { token, agent: toDto(row) }
}

export async function revokeAgentToken(ctx: IdentityContext, tokenId: unknown): Promise<AgentTokenDto> {
  await requireOwner(ctx, 'AGENT_TOKEN_REVOKED', 'AGENT_TOKEN', typeof tokenId === 'string' ? tokenId : null)
  const id = requireUuid(tokenId, 'Token')
  const [hit] = await db()<{ token_id: string }[]>`update agent_tokens set revoked_at = coalesce(revoked_at, now()) where token_id = ${id} returning token_id`
  if (!hit) throw new ServiceError('NOT_FOUND', 'Token tidak ditemukan.')
  await auditAs(ctx, { action: 'AGENT_TOKEN_REVOKED', resourceType: 'AGENT_TOKEN', resourceId: id, result: 'SUCCESS' })
  const [row] = await db()<Row[]>`${select()} where t.token_id = ${id}`
  return toDto(row)
}

export interface AgentIdentity extends IdentityContext {
  agentTokenId: string
  agentName: string
}

/**
 * Memverifikasi token agent → identity context user pemilik token (source AI).
 * Role/divisi dibaca ulang tiap request; user nonaktif atau token dicabut/kedaluwarsa langsung ditolak.
 */
export async function authenticateAgentToken(raw: string | null | undefined): Promise<AgentIdentity | null> {
  if (!raw || !raw.startsWith(AGENT_TOKEN_PREFIX) || raw.length > 200) return null
  const [r] = await db()<{
    token_id: string; name: string; user_id: string; email: string; user_name: string; role_id: IdentityContext['roleId']
    division_id: string | null; must_change_password: boolean
  }[]>`
    select t.token_id, t.name, u.user_id, u.email, u.name as user_name, u.role_id, u.division_id, u.must_change_password
    from agent_tokens t join users u on u.user_id = t.user_id
    where t.token_hash = ${sha256(raw)} and t.revoked_at is null and t.expires_at > now() and u.status = 'ACTIVE'`
  if (!r) return null
  if (r.must_change_password) return null
  await db()`update agent_tokens set last_used_at = now() where token_id = ${r.token_id}`
  return {
    userId: r.user_id, email: r.email, name: r.user_name, roleId: r.role_id, divisionId: r.division_id, source: 'AI',
    agentTokenId: r.token_id, agentName: r.name,
  }
}
