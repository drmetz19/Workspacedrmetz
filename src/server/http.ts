import { NextResponse, type NextRequest } from 'next/server'
import { getSessionUser } from './services/auth'
import { isServiceError, ServiceError } from './errors'
import type { IdentityContext } from './context'
import { config } from './config'

export const SESSION_COOKIE = 'csse_session'

export type Body = Record<string, string | string[] | undefined>

/** Membaca body JSON atau form (urlencoded / multipart). Field berulang → array. */
export async function readBody(req: Request): Promise<Body> {
  const type = req.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    const json = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const out: Body = {}
    for (const [k, v] of Object.entries(json)) {
      out[k] = Array.isArray(v) ? v.map(String) : v === null || v === undefined ? undefined : String(v)
    }
    return out
  }
  if (type.includes('form')) {
    const fd = await req.formData()
    const out: Body = {}
    for (const key of new Set(fd.keys())) {
      const all = fd.getAll(key).filter((v): v is string => typeof v === 'string')
      out[key] = all.length > 1 ? all : all[0]
    }
    return out
  }
  return {}
}

export const wantsJson = (req: Request) =>
  (req.headers.get('accept') ?? '').includes('application/json') || (req.headers.get('content-type') ?? '').includes('application/json')

export function tokenFromRequest(req: NextRequest | Request): string | null {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  const cookie = 'cookies' in req ? (req as NextRequest).cookies.get(SESSION_COOKIE)?.value : undefined
  return cookie ?? null
}

export async function userFromRequest(req: NextRequest): Promise<IdentityContext> {
  const token = tokenFromRequest(req)
  const viaBearer = req.headers.get('authorization')?.startsWith('Bearer ')
  const ctx = await getSessionUser(token, viaBearer ? 'API' : 'UI')
  if (!ctx) throw new ServiceError('UNAUTHENTICATED', 'Sesi berakhir. Silakan masuk lagi.')
  return ctx
}

/** Tolak POST lintas situs (lapisan tambahan di atas cookie SameSite=Lax). */
function assertSameOrigin(req: NextRequest) {
  if (req.method === 'GET' || req.method === 'HEAD') return
  const origin = req.headers.get('origin')
  if (!origin) return
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  try {
    if (new URL(origin).host !== host) throw new ServiceError('ACCESS_DENIED', 'Permintaan lintas situs ditolak.')
  } catch (e) {
    if (isServiceError(e)) throw e
    throw new ServiceError('ACCESS_DENIED', 'Origin tidak valid.')
  }
}

/** URL relatif aman (mencegah open redirect). */
export function safeReturnTo(v: unknown, fallback: string) {
  return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : fallback
}

export function redirect303(req: Request, path: string, params: Record<string, string | undefined> = {}) {
  const url = new URL(path, publicOrigin(req))
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v)
  return NextResponse.redirect(url, 303)
}

export function publicOrigin(req: Request) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')
  return host ? `${proto}://${host}` : config.appUrl
}

interface HandleOptions<T> {
  /** Ke mana form diarahkan setelah sukses. Bisa fungsi dari hasil. */
  onSuccess?: string | ((result: T) => string)
  successMessage?: string | ((result: T) => string)
  /** Ke mana form diarahkan saat error (default: returnTo dari body, lalu referer). */
  onError?: string
  /** Wajib login (default true). */
  auth?: boolean
}

/**
 * Pembungkus route handler: autentikasi, parsing body, eksekusi service,
 * lalu respon JSON `{ status, data }` untuk klien API atau redirect 303 + pesan untuk form HTML.
 */
export function handler<T>(fn: (args: { req: NextRequest; ctx: IdentityContext; body: Body; params: Record<string, string> }) => Promise<T>, opts: HandleOptions<T> = {}) {
  return async (req: NextRequest, route: { params: Promise<Record<string, string>> }) => {
    const json = wantsJson(req)
    let body: Body = {}
    try {
      assertSameOrigin(req)
      body = req.method === 'GET' ? Object.fromEntries(req.nextUrl.searchParams) : await readBody(req)
      const ctx = opts.auth === false ? (null as unknown as IdentityContext) : await userFromRequest(req)
      const params = (await route?.params) ?? {}
      const result = await fn({ req, ctx, body, params })
      if (result instanceof Response) return result
      if (json) return NextResponse.json({ status: 'success', data: result })
      const target = typeof opts.onSuccess === 'function' ? opts.onSuccess(result) : opts.onSuccess
      const msg = typeof opts.successMessage === 'function' ? opts.successMessage(result) : opts.successMessage
      return redirect303(req, target ?? safeReturnTo(body.returnTo, '/'), { msg })
    } catch (e) {
      return errorResponse(req, e, json, opts.onError ?? safeReturnTo(body.errorTo ?? body.returnTo, refererPath(req) ?? '/'))
    }
  }
}

function refererPath(req: Request) {
  const ref = req.headers.get('referer')
  if (!ref) return null
  try {
    const u = new URL(ref)
    u.searchParams.delete('err')
    u.searchParams.delete('msg')
    return u.pathname + u.search
  } catch {
    return null
  }
}

export function errorResponse(req: Request, e: unknown, json: boolean, backTo: string) {
  const err = isServiceError(e) ? e : null
  if (!err) console.error(e)
  const code = err?.code ?? 'INTERNAL'
  const message = err?.message ?? 'Terjadi kesalahan. Silakan coba lagi.'
  const status = err?.status ?? 500
  if (json) return NextResponse.json({ status: 'error', code, message, details: err?.details }, { status })
  if (code === 'UNAUTHENTICATED') return redirect303(req, '/login', { err: message })
  return redirect303(req, backTo, { err: message })
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.appUrl.startsWith('https:'),
    path: '/',
    expires,
  }
}
