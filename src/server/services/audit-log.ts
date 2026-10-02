import { z } from 'zod'
import { db } from '../db'
import type { IdentityContext } from '../context'
import { requireOwner } from '../guards'
import { optionalDate, optionalText, optionalUuid, parseInput } from '../validation'

export interface AuditRow {
  eventId: string
  occurredAt: Date
  action: string
  result: string
  source: string
  actorUserId: string | null
  actorName: string | null
  actorEmail: string | null
  resourceType: string | null
  resourceId: string | null
  resourceLabel: string | null
  metadata: Record<string, unknown>
}

const AuditFilter = z.object({
  actorUserId: optionalUuid,
  action: optionalText,
  result: z.enum(['', 'SUCCESS', 'DENIED', 'FAILED', 'REJECTED']).nullish().transform((v) => v || null),
  documentId: optionalUuid,
  /** Cari teks di nama dokumen / email aktor. */
  q: optionalText,
  from: optionalDate,
  to: optionalDate,
  before: z.string().nullish().transform((v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : null)),
  limit: z.coerce.number().int().min(1).max(1000).nullish().transform((v) => v ?? 100),
})

/** get_audit_history — khusus Owner. Filter: user, dokumen, aksi, hasil, rentang tanggal (WIB). */
export async function getAuditHistory(ctx: IdentityContext, input: unknown): Promise<{ events: AuditRow[]; nextBefore: string | null }> {
  await requireOwner(ctx, 'AUDIT_VIEWED', 'AUDIT')
  const f = parseInput(AuditFilter, input ?? {})
  const q = db()
  const rows = await q<{
    event_id: string; occurred_at: Date; action: string; result: string; source: string; actor_user_id: string | null; actor_name: string | null
    actor_email: string | null; resource_type: string | null; resource_id: string | null; resource_label: string | null; metadata: Record<string, unknown>
  }[]>`
    select a.event_id, a.occurred_at, a.action, a.result, a.source, a.actor_user_id, u.name as actor_name, a.actor_email,
      a.resource_type, a.resource_id, a.metadata,
      coalesce(d.document_name, s.name, tu.email, v.division_name, c.category_name) as resource_label
    from audit_events a
    left join users u on u.user_id = a.actor_user_id
    left join documents d on a.resource_type = 'DOCUMENT' and d.document_id::text = a.resource_id
    left join drive_sources s on a.resource_type = 'DRIVE_SOURCE' and s.source_id::text = a.resource_id
    left join users tu on a.resource_type = 'USER' and tu.user_id::text = a.resource_id
    left join divisions v on a.resource_type = 'DIVISION' and v.division_id::text = a.resource_id
    left join categories c on a.resource_type = 'CATEGORY' and c.category_id::text = a.resource_id
    where ${f.actorUserId ? q`a.actor_user_id = ${f.actorUserId}` : q`true`}
      and ${f.action ? q`a.action = ${f.action}` : q`true`}
      and ${f.result ? q`a.result = ${f.result}` : q`true`}
      and ${f.documentId ? q`a.resource_type = 'DOCUMENT' and a.resource_id = ${f.documentId}` : q`true`}
      and ${f.q ? q`(d.document_name ilike ${'%' + f.q + '%'} or a.actor_email ilike ${'%' + f.q + '%'} or u.name ilike ${'%' + f.q + '%'})` : q`true`}
      and ${f.from ? q`a.occurred_at >= (${f.from}::date)::timestamp at time zone 'Asia/Jakarta'` : q`true`}
      and ${f.to ? q`a.occurred_at < ((${f.to}::date + 1)::timestamp at time zone 'Asia/Jakarta')` : q`true`}
      and ${f.before ? q`a.occurred_at < ${f.before}` : q`true`}
    order by a.occurred_at desc, a.event_id desc
    limit ${f.limit + 1}`
  const events = rows.slice(0, f.limit).map((r) => ({
    eventId: r.event_id, occurredAt: r.occurred_at, action: r.action, result: r.result, source: r.source, actorUserId: r.actor_user_id,
    actorName: r.actor_name, actorEmail: r.actor_email, resourceType: r.resource_type, resourceId: r.resource_id, resourceLabel: r.resource_label, metadata: r.metadata,
  }))
  return { events, nextBefore: rows.length > f.limit ? events[events.length - 1].occurredAt.toISOString() : null }
}

export async function listAuditActions(ctx: IdentityContext): Promise<string[]> {
  await requireOwner(ctx, 'AUDIT_VIEWED', 'AUDIT')
  return (await db()<{ action: string }[]>`select distinct action from audit_events order by action`).map((r) => r.action)
}

export function toCsv(events: AuditRow[]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = ['waktu_utc', 'aksi', 'hasil', 'sumber', 'aktor', 'email_aktor', 'tipe_resource', 'id_resource', 'resource', 'metadata']
  const lines = events.map((e) => [e.occurredAt.toISOString(), e.action, e.result, e.source, e.actorName, e.actorEmail, e.resourceType, e.resourceId, e.resourceLabel, e.metadata].map(esc).join(','))
  return [head.join(','), ...lines].join('\n')
}
