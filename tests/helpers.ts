import { db, closeDb } from '@/server/db'
import type { IdentityContext, RoleId } from '@/server/context'
import { localIdentityProvider } from '@/server/integrations/identity/local'

const KEEP = new Set(['roles', 'schema_migrations'])

/** Mengosongkan semua tabel data lalu menanam ulang data dasar (divisi pilot, kategori). */
export async function resetDb() {
  const sql = db()
  const tables = await sql<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public'`
  const names = tables.map((t) => t.tablename).filter((t) => !KEEP.has(t))
  if (names.length) {
    await sql.begin(async (tx) => {
      await tx`select set_config('csse.allow_audit_truncate', 'on', true)`
      await tx.unsafe(`truncate ${names.map((n) => `"${n}"`).join(', ')} restart identity cascade`)
    })
  }
  await sql`insert into divisions (division_name) values ('Legal/Perizinan')`
  await reseedExtra()
}

/** Diperluas oleh fase berikutnya (mis. kategori). */
async function reseedExtra() {
  const sql = db()
  const hasCategories = await sql`select 1 from pg_tables where tablename = 'categories'`
  if (hasCategories.length) {
    await sql`insert into categories (category_name) values
      ('Izin Operasional'), ('SIP'), ('STR'), ('Kontrak'), ('MoU'), ('Sewa'), ('Sertifikat'), ('Lainnya')`
  }
}

export async function divisionId(name = 'Legal/Perizinan'): Promise<string> {
  const [row] = await db()<{ division_id: string }[]>`select division_id from divisions where division_name = ${name}`
  if (row) return row.division_id
  const [created] = await db()<{ division_id: string }[]>`insert into divisions (division_name) values (${name}) returning division_id`
  return created.division_id
}

let counter = 0
export async function createUser(opts: {
  role?: RoleId
  email?: string
  name?: string
  status?: 'INVITED' | 'ACTIVE' | 'DEACTIVATED'
  division?: string | null
  password?: string
} = {}): Promise<IdentityContext> {
  const role = opts.role ?? 'DIVISION_USER'
  const email = (opts.email ?? `user${++counter}@drmetz.test`).toLowerCase()
  const name = opts.name ?? email.split('@')[0]
  const div = opts.division === null ? null : await divisionId(opts.division ?? 'Legal/Perizinan')
  const [row] = await db()<{ user_id: string }[]>`
    insert into users (email, name, role_id, division_id, status)
    values (${email}, ${name}, ${role}, ${div}, ${opts.status ?? 'ACTIVE'}) returning user_id`
  if (opts.password) await localIdentityProvider.setPassword(email, opts.password)
  return { userId: row.user_id, email, name, roleId: role, divisionId: div, source: 'UI' }
}

export async function auditActions(filter: { action?: string } = {}) {
  const rows = await db()<{ action: string; result: string; actor_email: string | null; metadata: Record<string, unknown>; resource_id: string | null }[]>`
    select action, result, actor_email, metadata, resource_id from audit_events
    where ${filter.action ? db()`action = ${filter.action}` : db()`true`}
    order by occurred_at`
  return rows
}

export async function lastEmailTo(to: string) {
  const [row] = await db()<{ subject: string; body: string }[]>`
    select subject, body from email_outbox where to_email = ${to} order by created_at desc limit 1`
  return row
}

export function tokenFromEmail(body: string): string {
  const m = body.match(/token=([A-Za-z0-9_-]+)/)
  if (!m) throw new Error('token tidak ada di email')
  return m[1]
}

export { closeDb }
