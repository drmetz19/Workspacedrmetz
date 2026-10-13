import { z } from 'zod'
import { db } from '../db'
import { config } from '../config'
import { auditAs } from '../audit'
import { ServiceError } from '../errors'
import type { IdentityContext } from '../context'
import { requireOwner } from '../guards'
import { optionalUuid, parseInput, requireUuid } from '../validation'
import { sendEmail } from '../integrations/email'
import { identityProvider } from '../integrations/identity'
import { issueAuthToken } from './auth'
import { findUserById, normalizeEmail, toUserDto, type UserDto, type UserRow } from './users-repo'

const InviteInput = z.object({
  email: z.string().trim().email('email tidak valid'),
  name: z.string().trim().min(1, 'wajib diisi'),
  roleId: z.enum(['OWNER', 'GM', 'DIVISION_USER']),
  divisionId: optionalUuid,
  /** DEFAULT_PASSWORD = langsung bisa masuk dengan password pola divisi; INVITE_LINK = buat password sendiri lewat tautan. */
  loginMode: z.enum(['DEFAULT_PASSWORD', 'INVITE_LINK']).default('INVITE_LINK'),
})

// ── Password default akun divisi ────────────────────────────────────────
/** Pola password default: kata pertama nama divisi + suffix, mis. "Legal/Perizinan" → Legal@DrMetz2026. */
export function defaultPasswordFor(divisionName: string | null | undefined): string {
  const word = (divisionName ?? '').split(/[^A-Za-z0-9]+/).find(Boolean) ?? 'Staf'
  return word.charAt(0).toUpperCase() + word.slice(1) + config.auth.defaultPasswordSuffix
}

async function divisionNameOf(divisionId: string | null) {
  if (!divisionId) return null
  const [d] = await db()<{ division_name: string }[]>`select division_name from divisions where division_id = ${divisionId}`
  return d?.division_name ?? null
}

/** Set password default + wajib ganti saat masuk pertama; sesi lama dicabut. Pemanggil sudah memeriksa hak Owner. */
async function applyDefaultPassword(ctx: IdentityContext, user: UserRow): Promise<string> {
  const password = defaultPasswordFor(await divisionNameOf(user.division_id))
  await identityProvider().setPassword(user.email, password)
  await db().begin(async (tx) => {
    await tx`update users set must_change_password = true, failed_login_count = 0, locked_until = null, updated_at = now()
             where user_id = ${user.user_id}`
    await tx`update sessions set revoked_at = now() where user_id = ${user.user_id} and revoked_at is null`
    await auditAs(ctx, { action: 'PASSWORD_DEFAULT_SET', resourceType: 'USER', resourceId: user.user_id, result: 'SUCCESS', metadata: { email: user.email } }, tx)
  })
  return password
}

function assertDefaultPasswordEligible(user: UserRow) {
  if (user.role_id !== 'DIVISION_USER') throw new ServiceError('VALIDATION', 'Password default hanya untuk Division User. Owner & GM masuk dengan Google.')
  if (user.status === 'DEACTIVATED') throw new ServiceError('VALIDATION', 'Akun dinonaktifkan. Aktifkan kembali terlebih dahulu.')
}

function defaultPasswordEmail(user: Pick<UserRow, 'name' | 'email'>, password: string) {
  return {
    to: user.email,
    subject: 'Akun Dr. Metz Workspace',
    body: `Halo ${user.name},\n\nAkun Dr. Metz Workspace Anda sudah siap.\n\nMasuk di: ${config.appUrl}/login\nEmail: ${user.email}\nPassword awal: ${password}\n\nSaat masuk pertama kali Anda akan diminta membuat password baru.\n`,
  }
}

/** Owner mereset password satu Division User ke pola default divisinya. */
export async function setDefaultPassword(ctx: IdentityContext, userId: unknown): Promise<{ email: string; password: string }> {
  await requireOwner(ctx, 'PASSWORD_DEFAULT_SET', 'USER', typeof userId === 'string' ? userId : null)
  const id = requireUuid(userId, 'User')
  const user = await findUserById(db(), id)
  if (!user) throw new ServiceError('NOT_FOUND', 'User tidak ditemukan.')
  assertDefaultPasswordEligible(user)
  const password = await applyDefaultPassword(ctx, user)
  await sendEmail(defaultPasswordEmail(user, password))
  return { email: user.email, password }
}

/** Owner menyiapkan password default untuk semua Division User yang belum pernah masuk (status Diundang). */
export async function setDefaultPasswordsForPending(ctx: IdentityContext): Promise<{ count: number }> {
  await requireOwner(ctx, 'PASSWORD_DEFAULT_SET', 'USER')
  const pending = await db()<UserRow[]>`select * from users where role_id = 'DIVISION_USER' and status = 'INVITED' and not must_change_password order by email`
  for (const user of pending) {
    const password = await applyDefaultPassword(ctx, user)
    await sendEmail(defaultPasswordEmail(user, password))
  }
  return { count: pending.length }
}

export async function inviteUser(ctx: IdentityContext, input: unknown): Promise<UserDto & { defaultPassword?: string }> {
  await requireOwner(ctx, 'USER_INVITED', 'USER')
  const data = parseInput(InviteInput, input)
  const email = normalizeEmail(data.email)
  if (data.divisionId) {
    const [d] = await db()`select 1 from divisions where division_id = ${data.divisionId} and status = 'ACTIVE'`
    if (!d) throw new ServiceError('VALIDATION', 'divisionId: divisi tidak ditemukan')
  }
  const user = await db().begin(async (tx) => {
    const [exists] = await tx`select 1 from users where email = ${email}`
    if (exists) throw new ServiceError('CONFLICT', 'Email ini sudah terdaftar.')
    const [row] = await tx<UserRow[]>`
      insert into users (email, name, role_id, division_id, status, invited_by)
      values (${email}, ${data.name}, ${data.roleId}, ${data.divisionId}, 'INVITED', ${ctx.userId}) returning *`
    await auditAs(ctx, { action: 'USER_INVITED', resourceType: 'USER', resourceId: row.user_id, result: 'SUCCESS', metadata: { email, roleId: data.roleId } }, tx)
    return row
  })

  if (data.roleId === 'DIVISION_USER' && data.loginMode === 'DEFAULT_PASSWORD') {
    const password = await applyDefaultPassword(ctx, user)
    await sendEmail(defaultPasswordEmail(user, password))
    return { ...toUserDto(user), defaultPassword: password }
  }

  const loginUrl = `${config.appUrl}/login`
  let body = `Halo ${user.name},\n\nAnda diundang ke Dr. Metz Workspace (CSSE).\n\n`
  if (data.roleId === 'OWNER' || data.roleId === 'GM') {
    body += `Masuk dengan akun Google ${email} di:\n${loginUrl}\n`
  } else {
    const token = await issueAuthToken(user.user_id, 'INVITE')
    body += `Pilih salah satu cara masuk:\n• Masuk dengan Google (akun ${email}) di ${loginUrl}\n• Atau buat password di: ${config.appUrl}/invite/accept?token=${token}\n  (tautan berlaku ${config.auth.inviteTokenHours} jam)\n`
  }
  await sendEmail({ to: email, subject: 'Undangan Dr. Metz Workspace', body })
  return toUserDto(user)
}

export async function deactivateUser(ctx: IdentityContext, userId: unknown) {
  await requireOwner(ctx, 'USER_DEACTIVATED', 'USER', typeof userId === 'string' ? userId : null)
  const id = requireUuid(userId, 'User')
  if (id === ctx.userId) throw new ServiceError('VALIDATION', 'Anda tidak dapat menonaktifkan akun sendiri.')
  const target = await findUserById(db(), id)
  if (!target) throw new ServiceError('NOT_FOUND', 'User tidak ditemukan.')
  await db().begin(async (tx) => {
    await tx`update users set status = 'DEACTIVATED', updated_at = now() where user_id = ${id}`
    await tx`update sessions set revoked_at = now() where user_id = ${id} and revoked_at is null`
    await auditAs(ctx, { action: 'USER_DEACTIVATED', resourceType: 'USER', resourceId: id, result: 'SUCCESS', metadata: { email: target.email } }, tx)
  })
}

export async function listUsers(ctx: IdentityContext): Promise<(UserDto & { divisionName: string | null; roleName: string })[]> {
  await requireOwner(ctx, 'USERS_LISTED', 'USER')
  const rows = await db()<(UserRow & { division_name: string | null; role_name: string })[]>`
    select u.*, d.division_name, r.role_name from users u
    left join divisions d on d.division_id = u.division_id
    join roles r on r.role_id = u.role_id
    order by r.role_level desc, u.name`
  return rows.map((r) => ({ ...toUserDto(r), divisionName: r.division_name, roleName: r.role_name }))
}

const UpdateUserInput = z.object({
  name: z.string().trim().min(1, 'wajib diisi'),
  roleId: z.enum(['OWNER', 'GM', 'DIVISION_USER']),
  divisionId: optionalUuid,
})

/** Owner mengubah nama, role, dan divisi user. Berlaku langsung karena konteks dibaca ulang tiap request. */
export async function updateUser(ctx: IdentityContext, userId: unknown, input: unknown): Promise<UserDto> {
  await requireOwner(ctx, 'USER_UPDATED', 'USER', typeof userId === 'string' ? userId : null)
  const id = requireUuid(userId, 'User')
  const data = parseInput(UpdateUserInput, input)
  const before = await findUserById(db(), id)
  if (!before) throw new ServiceError('NOT_FOUND', 'User tidak ditemukan.')
  if (id === ctx.userId && data.roleId !== 'OWNER') throw new ServiceError('VALIDATION', 'Anda tidak dapat menurunkan role akun sendiri.')
  if (data.divisionId) {
    const [d] = await db()`select 1 from divisions where division_id = ${data.divisionId}`
    if (!d) throw new ServiceError('VALIDATION', 'divisionId: divisi tidak ditemukan')
  }
  const row = await db().begin(async (tx) => {
    const [r] = await tx<UserRow[]>`
      update users set name = ${data.name}, role_id = ${data.roleId}, division_id = ${data.divisionId}, updated_at = now()
      where user_id = ${id} returning *`
    await auditAs(ctx, {
      action: 'USER_UPDATED', resourceType: 'USER', resourceId: id, result: 'SUCCESS',
      metadata: {
        before: { name: before.name, roleId: before.role_id, divisionId: before.division_id },
        after: { name: data.name, roleId: data.roleId, divisionId: data.divisionId },
      },
    }, tx)
    return r
  })
  return toUserDto(row)
}

export async function reactivateUser(ctx: IdentityContext, userId: unknown) {
  await requireOwner(ctx, 'USER_REACTIVATED', 'USER', typeof userId === 'string' ? userId : null)
  const id = requireUuid(userId, 'User')
  const target = await findUserById(db(), id)
  if (!target) throw new ServiceError('NOT_FOUND', 'User tidak ditemukan.')
  if (target.status !== 'DEACTIVATED') return
  await db().begin(async (tx) => {
    await tx`update users set status = case when last_login_at is null then 'INVITED' else 'ACTIVE' end,
               failed_login_count = 0, locked_until = null, updated_at = now() where user_id = ${id}`
    await auditAs(ctx, { action: 'USER_REACTIVATED', resourceType: 'USER', resourceId: id, result: 'SUCCESS' }, tx)
  })
}
