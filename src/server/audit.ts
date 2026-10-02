import { db, type Sql, type Tx } from './db'
import type { IdentityContext, Source } from './context'

export type AuditResult = 'SUCCESS' | 'DENIED' | 'FAILED' | 'REJECTED'

export interface AuditInput {
  actorUserId?: string | null
  actorEmail?: string | null
  action: string
  resourceType?: string | null
  resourceId?: string | null
  result: AuditResult
  source?: Source
  metadata?: Record<string, unknown>
}

/** Mencatat audit event (append-only). Bisa dipakai di dalam transaksi agar atomik dengan aksinya. */
export async function recordAudit(e: AuditInput, q: Sql | Tx = db()) {
  await q`
    insert into audit_events (actor_user_id, actor_email, action, resource_type, resource_id, result, source, metadata)
    values (${e.actorUserId ?? null}, ${e.actorEmail ?? null}, ${e.action}, ${e.resourceType ?? null},
            ${e.resourceId ?? null}, ${e.result}, ${e.source ?? 'UI'}, ${q.json((e.metadata ?? {}) as never)})`
}

/** Bentuk singkat: audit atas nama identity context. */
export function auditAs(ctx: IdentityContext, e: Omit<AuditInput, 'actorUserId' | 'actorEmail' | 'source'>, q?: Sql | Tx) {
  return recordAudit({ ...e, actorUserId: ctx.userId, actorEmail: ctx.email, source: ctx.source }, q)
}
