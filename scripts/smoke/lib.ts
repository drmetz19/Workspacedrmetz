import { spawn, type ChildProcess } from 'node:child_process'
import postgres from 'postgres'
import { migrate } from '../../src/server/db/migrate'

export const PORT = Number(process.env.SMOKE_PORT ?? 3100)
export const BASE = `http://localhost:${PORT}`
const ADMIN_URL = 'postgres://postgres:postgres@localhost:5432/postgres'
export const SMOKE_DB_URL = 'postgres://postgres:postgres@localhost:5432/csse_smoke'
export const OWNER_EMAIL = 'owner@drmetz.test'

export const smokeEnv: Record<string, string> = {
  DATABASE_URL: SMOKE_DB_URL,
  APP_URL: BASE,
  IDENTITY_PROVIDER: 'local',
  CSSE_ALLOW_DEV_IDP: '1',
  CSSE_BOOTSTRAP_OWNER_EMAIL: OWNER_EMAIL,
  CSSE_BOOTSTRAP_OWNER_NAME: 'dr. Metz',
  DRIVE_PROVIDER: 'mock',
  CRON_SECRET: 'smoke-cron',
  AI_PROVIDER: 'mock',
}

let sqlClient: postgres.Sql | null = null
export function sql() {
  sqlClient ??= postgres(SMOKE_DB_URL, { max: 2, onnotice: () => {} })
  return sqlClient
}

export async function resetSmokeDb() {
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} })
  await admin.unsafe('drop database if exists csse_smoke with (force)')
  await admin.unsafe('create database csse_smoke')
  await admin.end()
  await migrate(SMOKE_DB_URL)
  const s = postgres(SMOKE_DB_URL, { max: 1, onnotice: () => {} })
  await s`insert into users (email, name, role_id, status) values (${OWNER_EMAIL}, 'dr. Metz', 'OWNER', 'INVITED')`
  await s.end()
}

export async function startServer(extraEnv: Record<string, string> = {}): Promise<ChildProcess> {
  const proc = spawn('pnpm', ['exec', 'next', 'start', '-p', String(PORT)], {
    env: { ...process.env, ...smokeEnv, ...extraEnv, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  proc.stdout!.on('data', (d) => (log += d))
  proc.stderr!.on('data', (d) => (log += d))
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/login`)
      if (r.status < 500) return Object.assign(proc, { getLog: () => log })
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  proc.kill()
  throw new Error('Server tidak siap:\n' + log)
}

export function stopServer(proc: ChildProcess) {
  proc.kill('SIGTERM')
}

/** Klien HTTP dengan cookie jar, tanpa mengikuti redirect otomatis. */
export class Client {
  cookies = new Map<string, string>()
  constructor(public label = 'anon') {}

  private cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  private store(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';')
      const i = pair.indexOf('=')
      const name = pair.slice(0, i).trim()
      const value = pair.slice(i + 1).trim()
      const expired = attrs.some((a) => /expires=thu, 01 jan 1970/i.test(a.trim())) || attrs.some((a) => /max-age=0\b/i.test(a.trim()))
      if (!value || expired) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  async req(method: string, path: string, init: { form?: Record<string, string | string[]>; json?: unknown; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { cookie: this.cookieHeader(), ...(init.headers ?? {}) }
    let body: BodyInit | undefined
    if (init.form) {
      const p = new URLSearchParams()
      for (const [k, v] of Object.entries(init.form)) for (const one of [v].flat()) p.append(k, one)
      body = p
      headers['content-type'] = 'application/x-www-form-urlencoded'
    } else if (init.json !== undefined) {
      body = JSON.stringify(init.json)
      headers['content-type'] = 'application/json'
      headers['accept'] = 'application/json'
    }
    const url = path.startsWith('http') ? path : BASE + path
    const res = await fetch(url, { method, headers, body, redirect: 'manual' })
    this.store(res)
    const text = (await res.text()).replace(/<!-- -->/g, "")
    const location = res.headers.get('location')
    return { status: res.status, location, text, headers: res.headers, json: () => JSON.parse(text) }
  }
  get(path: string, headers?: Record<string, string>) { return this.req('GET', path, { headers }) }
  post(path: string, form: Record<string, string | string[]> = {}) { return this.req('POST', path, { form }) }
  postJson(path: string, json: unknown) { return this.req('POST', path, { json }) }
  getJson(path: string) { return this.req('GET', path, { headers: { accept: 'application/json' } }) }

  /** Login Google lewat simulasi dev IdP (start → halaman dev → callback). */
  async loginGoogle(email: string) {
    const start = await this.get('/api/auth/google/start')
    const devUrl = new URL(start.location!)
    const state = devUrl.searchParams.get('state')!
    return this.get(`/api/auth/google/callback?state=${encodeURIComponent(state)}&dev_email=${encodeURIComponent(email)}`)
  }

  async loginPassword(email: string, password: string) {
    return this.post('/api/auth/password', { email, password })
  }
}

export const decodeLoc = (loc: string | null) => (loc ? decodeURIComponent(new URL(loc, BASE).search.replace(/\+/g, ' ')) : '')

export async function outboxToken(email: string) {
  const [row] = await sql()<{ body: string }[]>`select body from email_outbox where to_email = ${email} order by created_at desc limit 1`
  const m = row?.body.match(/token=([A-Za-z0-9_-]+)/)
  return m?.[1] ?? null
}

/** Helper: Owner mengundang lalu user set password via token undangan; mengembalikan klien login. */
export async function inviteAndLogin(owner: Client, opts: { email: string; name: string; roleId: string; divisionId?: string; password?: string }) {
  const r = await owner.post('/api/admin/users', { email: opts.email, name: opts.name, roleId: opts.roleId, divisionId: opts.divisionId ?? '' })
  if (r.status !== 303 || !r.location?.includes('msg=')) throw new Error(`Undangan gagal untuk ${opts.email}: ${decodeLoc(r.location)}`)
  const c = new Client(opts.email)
  if (opts.roleId === 'DIVISION_USER') {
    const token = await outboxToken(opts.email)
    await c.post('/api/auth/password-token', { token: token!, password: opts.password ?? 'rahasia-123', confirm: opts.password ?? 'rahasia-123' })
    const l = await c.loginPassword(opts.email, opts.password ?? 'rahasia-123')
    if (l.location !== BASE + '/') throw new Error(`Login gagal ${opts.email}: ${decodeLoc(l.location)}`)
  } else {
    const l = await c.loginGoogle(opts.email)
    if (l.location !== BASE + '/') throw new Error(`Login Google gagal ${opts.email}: ${decodeLoc(l.location)}`)
  }
  return c
}

export async function auditCount(action: string, where: { result?: string } = {}) {
  const [r] = await sql()<{ n: number }[]>`select count(*)::int as n from audit_events where action = ${action}
    and ${where.result ? sql()`result = ${where.result}` : sql()`true`}`
  return r.n
}

export async function divisionIdByName(name: string) {
  const [r] = await sql()<{ division_id: string }[]>`select division_id from divisions where division_name = ${name}`
  return r?.division_id
}

// ── Pelaporan ──────────────────────────────────────────────────────────
export interface Check { name: string; ok: boolean; detail?: string }
export class Smoke {
  checks: Check[] = []
  constructor(public phase: string) {}
  check(name: string, ok: boolean, detail?: string) {
    this.checks.push({ name, ok, detail })
    console.log(`  ${ok ? '✓' : '✗'} ${name}${!ok && detail ? `\n      → ${detail}` : ''}`)
  }
  get passed() { return this.checks.every((c) => c.ok) }
}

export async function categoryIdByName(name: string) {
  const [r] = await sql()<{ category_id: string }[]>`select category_id from categories where category_name = ${name}`
  return r?.category_id
}

/** Mendaftarkan dokumen lewat form; mengembalikan document_id dari redirect. */
export async function createDoc(c: Client, form: Record<string, string>) {
  const r = await c.post('/api/documents', form)
  const m = r.location?.match(/\/documents\/([0-9a-f-]{36})/)
  if (!m) throw new Error(`Gagal membuat dokumen: ${decodeLoc(r.location)}`)
  return m[1]
}

export async function addDriveFile(container: string, id: string, name: string, text: string | null = null, mime = 'application/pdf') {
  await sql()`insert into dev_drive_files (container_id, file_id, name, mime_type, text_content) values (${container}, ${id}, ${name}, ${mime}, ${text})`
}
