import { config } from '../../config'
import { ServiceError } from '../../errors'
import type { IdentityProvider } from './types'

/**
 * Supabase Auth (GoTrue REST). Dipakai bila IDENTITY_PROVIDER=supabase.
 * Google OAuth memakai alur PKCE; password diverifikasi dengan grant_type=password.
 * Set password memakai Admin API (service role key) — hanya dipanggil dari server.
 */
function base() {
  const { url, anonKey } = config.supabase
  if (!url || !anonKey) throw new ServiceError('UNAVAILABLE', 'Supabase belum dikonfigurasi.')
  return { url: url.replace(/\/$/, ''), anonKey }
}

async function adminFetch(path: string, init: RequestInit = {}) {
  const { url } = base()
  const key = config.supabase.serviceRoleKey
  if (!key) throw new ServiceError('UNAVAILABLE', 'SUPABASE_SERVICE_ROLE_KEY belum di-set.')
  return fetch(`${url}/auth/v1${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

export const supabaseIdentityProvider: IdentityProvider = {
  name: 'supabase',

  async verifyPassword(email, password) {
    const { url, anonKey } = base()
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (res.ok) return true
    if (res.status === 400 || res.status === 401) return false
    throw new ServiceError('UNAVAILABLE', 'Layanan login sedang tidak tersedia.')
  },

  async setPassword(email, password) {
    const created = await adminFetch('/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, email_confirm: true }),
    })
    if (created.ok) return
    // User sudah ada → cari id lalu update password.
    const list = await adminFetch('/admin/users?page=1&per_page=1000')
    if (!list.ok) throw new ServiceError('UNAVAILABLE', 'Gagal menghubungi Supabase.')
    const body = (await list.json()) as { users: { id: string; email: string }[] }
    const user = body.users.find((u) => u.email?.toLowerCase() === email)
    if (!user) throw new ServiceError('UNAVAILABLE', 'User Supabase tidak ditemukan.')
    const upd = await adminFetch(`/admin/users/${user.id}`, { method: 'PUT', body: JSON.stringify({ password }) })
    if (!upd.ok) throw new ServiceError('UNAVAILABLE', 'Gagal menyimpan password.')
  },

  googleAuthorizeUrl({ redirectUri, codeChallenge, state }) {
    const { url } = base()
    const callback = new URL(redirectUri)
    callback.searchParams.set('state', state)
    const u = new URL(`${url}/auth/v1/authorize`)
    u.searchParams.set('provider', 'google')
    u.searchParams.set('redirect_to', callback.toString())
    u.searchParams.set('code_challenge', codeChallenge)
    u.searchParams.set('code_challenge_method', 's256')
    return u.toString()
  },

  async googleCallback({ params, codeVerifier }) {
    const code = params.get('code')
    if (!code) throw new ServiceError('INVALID_TOKEN', 'Login Google dibatalkan atau gagal.')
    const { url, anonKey } = base()
    const res = await fetch(`${url}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_code: code, code_verifier: codeVerifier }),
    })
    if (!res.ok) throw new ServiceError('INVALID_TOKEN', 'Login Google gagal diverifikasi.')
    const body = (await res.json()) as { user?: { email?: string; email_confirmed_at?: string } }
    const email = body.user?.email?.toLowerCase()
    if (!email) throw new ServiceError('INVALID_TOKEN', 'Akun Google tidak mengembalikan email.')
    return { email, emailVerified: Boolean(body.user?.email_confirmed_at) }
  },
}
