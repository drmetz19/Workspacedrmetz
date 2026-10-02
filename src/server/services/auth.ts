import { db } from '../db'
import { config } from '../config'
import { recordAudit } from '../audit'
import { ServiceError } from '../errors'
import { newToken, sha256 } from '../crypto'
import type { IdentityContext, Source } from '../context'
import { identityProvider } from '../integrations/identity'
import type { VerifiedIdentity } from '../integrations/identity/types'
import { sendEmail } from '../integrations/email'
import { findUserByEmail, normalizeEmail, toUserDto, type UserDto, type UserRow } from './users-repo'

type Method = 'PASSWORD' | 'GOOGLE'

export interface LoginResult {
  sessionToken: string
  user: UserDto
  expiresAt: Date
}

const GOOGLE_ONLY_ROLES = new Set(['OWNER', 'GM'])

async function reject(email: string, method: Method, reason: string, user: UserRow | null, code: ConstructorParameters<typeof ServiceError>[0], message: string): Promise<never> {
  await recordAudit({
    actorUserId: user?.user_id ?? null,
    actorEmail: email,
    action: 'LOGIN_REJECTED',
    resourceType: 'USER',
    resourceId: user?.user_id ?? null,
    result: 'REJECTED',
    source: 'UI',
    metadata: { method, reason },
  })
  throw new ServiceError(code, message)
}

/** Pemeriksaan gerbang yang sama untuk semua metode login: undangan, status, kebijakan metode. */
async function gate(emailRaw: string, method: Method): Promise<UserRow> {
  const email = normalizeEmail(emailRaw)
  const user = await findUserByEmail(db(), email)
  if (!user) return reject(email, method, 'NOT_INVITED', null, 'NOT_INVITED', 'Email ini belum diundang ke CSSE. Hubungi Owner/Admin.')
  if (user.status === 'DEACTIVATED')
    return reject(email, method, 'DEACTIVATED', user, 'DEACTIVATED', 'Akun dinonaktifkan. Hubungi Owner/Admin.')
  if (method === 'PASSWORD' && GOOGLE_ONLY_ROLES.has(user.role_id))
    return reject(email, method, 'METHOD_NOT_ALLOWED', user, 'METHOD_NOT_ALLOWED', 'Akun Owner/GM wajib masuk dengan Google.')
  return user
}

async function startSession(user: UserRow, method: Method): Promise<LoginResult> {
  const token = newToken()
  const expiresAt = new Date(Date.now() + config.auth.sessionHours * 3600_000)
  const [updated] = await db().begin(async (tx) => {
    await tx`insert into sessions (session_hash, user_id, login_method, expires_at) values (${sha256(token)}, ${user.user_id}, ${method}, ${expiresAt})`
    const rows = await tx<UserRow[]>`
      update users set failed_login_count = 0, locked_until = null, last_login_at = now(),
        status = case when status = 'INVITED' then 'ACTIVE' else status end, updated_at = now()
      where user_id = ${user.user_id} returning *`
    await recordAudit(
      { actorUserId: user.user_id, actorEmail: user.email, action: 'LOGIN_SUCCEEDED', resourceType: 'USER', resourceId: user.user_id, result: 'SUCCESS', metadata: { method } },
      tx,
    )
    return rows
  })
  return { sessionToken: token, user: toUserDto(updated), expiresAt }
}

export async function loginWithPassword(emailRaw: string, password: string): Promise<LoginResult> {
  const user = await gate(emailRaw, 'PASSWORD')
  if (user.locked_until && user.locked_until > new Date()) {
    return reject(user.email, 'PASSWORD', 'LOCKED', user, 'LOCKED', 'Akun terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi nanti atau reset password.')
  }
  const ok = password.length > 0 && (await identityProvider().verifyPassword(user.email, password))
  if (!ok) {
    const attempts = (user.locked_until && user.locked_until <= new Date() ? 0 : user.failed_login_count) + 1
    const lock = attempts >= config.auth.maxFailedAttempts
    await db().begin(async (tx) => {
      await tx`update users set failed_login_count = ${attempts},
                 locked_until = ${lock ? new Date(Date.now() + config.auth.lockMinutes * 60_000) : null}
               where user_id = ${user.user_id}`
      await recordAudit({ actorUserId: user.user_id, actorEmail: user.email, action: 'LOGIN_FAILED', resourceType: 'USER', resourceId: user.user_id, result: 'FAILED', metadata: { method: 'PASSWORD', attempts } }, tx)
      if (lock)
        await recordAudit({ actorUserId: user.user_id, actorEmail: user.email, action: 'ACCOUNT_LOCKED', resourceType: 'USER', resourceId: user.user_id, result: 'SUCCESS', source: 'SYSTEM', metadata: { minutes: config.auth.lockMinutes } }, tx)
    })
    throw new ServiceError('INVALID_CREDENTIALS', 'Email atau password salah.')
  }
  return startSession(user, 'PASSWORD')
}

export async function loginWithGoogle(identity: VerifiedIdentity): Promise<LoginResult> {
  const user = await gate(identity.email, 'GOOGLE')
  if (!identity.emailVerified) {
    return reject(user.email, 'GOOGLE', 'EMAIL_UNVERIFIED', user, 'INVALID_CREDENTIALS', 'Email Google belum terverifikasi.')
  }
  return startSession(user, 'GOOGLE')
}

/** Mengembalikan identity context dari token sesi; role & divisi dibaca ulang dari DB setiap request. */
export async function getSessionUser(token: string | undefined | null, source: Source = 'UI'): Promise<IdentityContext | null> {
  if (!token) return null
  const [row] = await db()<UserRow[]>`
    select u.* from sessions s join users u on u.user_id = s.user_id
    where s.session_hash = ${sha256(token)} and s.revoked_at is null and s.expires_at > now() and u.status = 'ACTIVE'`
  if (!row) return null
  return { userId: row.user_id, email: row.email, name: row.name, roleId: row.role_id, divisionId: row.division_id, source }
}

export async function logout(token: string) {
  const [row] = await db()<{ user_id: string; email: string }[]>`
    update sessions s set revoked_at = now() from users u
    where s.session_hash = ${sha256(token)} and s.revoked_at is null and u.user_id = s.user_id
    returning u.user_id, u.email`
  if (row) await recordAudit({ actorUserId: row.user_id, actorEmail: row.email, action: 'LOGOUT', resourceType: 'USER', resourceId: row.user_id, result: 'SUCCESS' })
}

/** Membuat token sekali pakai (undangan / reset) dan mengembalikan token mentahnya. */
export async function issueAuthToken(userId: string, purpose: 'INVITE' | 'RESET_PASSWORD') {
  const token = newToken()
  const ms = purpose === 'INVITE' ? config.auth.inviteTokenHours * 3600_000 : config.auth.resetTokenMinutes * 60_000
  await db()`insert into auth_tokens (token_hash, user_id, purpose, expires_at) values (${sha256(token)}, ${userId}, ${purpose}, ${new Date(Date.now() + ms)})`
  return token
}

/** Selalu sukses dari sisi pemanggil (tidak membocorkan apakah email terdaftar). */
export async function requestPasswordReset(emailRaw: string) {
  const email = normalizeEmail(emailRaw)
  const user = await findUserByEmail(db(), email)
  const eligible = user && user.status !== 'DEACTIVATED' && !GOOGLE_ONLY_ROLES.has(user.role_id)
  await recordAudit({
    actorUserId: user?.user_id ?? null,
    actorEmail: email,
    action: 'PASSWORD_RESET_REQUESTED',
    resourceType: 'USER',
    resourceId: user?.user_id ?? null,
    result: eligible ? 'SUCCESS' : 'REJECTED',
  })
  if (!eligible) return
  const token = await issueAuthToken(user.user_id, 'RESET_PASSWORD')
  await sendEmail({
    to: email,
    subject: 'Reset password Dr. Metz Workspace',
    body: `Halo ${user.name},\n\nBuka tautan berikut untuk membuat password baru (berlaku ${config.auth.resetTokenMinutes} menit):\n${config.appUrl}/reset-password?token=${token}\n\nAbaikan email ini bila Anda tidak memintanya.`,
  })
}

/** Menyelesaikan token undangan/reset: set password di identity provider, buka kunci akun. */
export async function completePasswordToken(token: string, newPassword: string) {
  if (typeof newPassword !== 'string' || newPassword.length < 8) throw new ServiceError('VALIDATION', 'Password minimal 8 karakter.')
  const [row] = await db()<{ user_id: string; purpose: string; email: string; status: string; role_id: string }[]>`
    select t.user_id, t.purpose, u.email, u.status, u.role_id from auth_tokens t join users u on u.user_id = t.user_id
    where t.token_hash = ${sha256(token ?? '')} and t.used_at is null and t.expires_at > now()`
  if (!row || row.status === 'DEACTIVATED' || GOOGLE_ONLY_ROLES.has(row.role_id))
    throw new ServiceError('INVALID_TOKEN', 'Tautan tidak valid atau sudah kedaluwarsa.')
  const claimed = await db()`update auth_tokens set used_at = now() where token_hash = ${sha256(token)} and used_at is null returning 1`
  if (!claimed.length) throw new ServiceError('INVALID_TOKEN', 'Tautan tidak valid atau sudah kedaluwarsa.')
  await identityProvider().setPassword(row.email, newPassword)
  await db()`update users set failed_login_count = 0, locked_until = null, updated_at = now() where user_id = ${row.user_id}`
  await recordAudit({ actorUserId: row.user_id, actorEmail: row.email, action: 'PASSWORD_SET', resourceType: 'USER', resourceId: row.user_id, result: 'SUCCESS', metadata: { via: row.purpose } })
}
