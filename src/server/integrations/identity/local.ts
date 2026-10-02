import bcrypt from 'bcryptjs'
import { db } from '../../db'
import { config } from '../../config'
import { ServiceError } from '../../errors'
import type { IdentityProvider } from './types'

/**
 * Provider PENGEMBANGAN: password disimpan (bcrypt) di tabel local_identities,
 * login Google disimulasikan lewat halaman /dev/google-login. Ditolak bila CSSE_ALLOW_DEV_IDP != 1.
 */
export const localIdentityProvider: IdentityProvider = {
  name: 'local',

  async verifyPassword(email, password) {
    const [row] = await db()<{ password_hash: string }[]>`select password_hash from local_identities where email = ${email}`
    if (!row) return false
    return bcrypt.compare(password, row.password_hash)
  },

  async setPassword(email, password) {
    const hash = await bcrypt.hash(password, 10)
    await db()`
      insert into local_identities (email, password_hash) values (${email}, ${hash})
      on conflict (email) do update set password_hash = excluded.password_hash, updated_at = now()`
  },

  googleAuthorizeUrl({ state, redirectUri }) {
    assertDevAllowed()
    const u = new URL('/dev/google-login', config.appUrl)
    u.searchParams.set('state', state)
    u.searchParams.set('redirect_uri', redirectUri)
    return u.toString()
  },

  async googleCallback({ params }) {
    assertDevAllowed()
    const email = params.get('dev_email')
    if (!email) throw new ServiceError('INVALID_TOKEN', 'Login Google gagal.')
    return { email: email.trim().toLowerCase(), emailVerified: true }
  },
}

function assertDevAllowed() {
  if (!config.allowDevIdp) throw new ServiceError('UNAVAILABLE', 'Simulasi login Google hanya untuk pengembangan.')
}
