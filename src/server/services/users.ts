import { z } from 'zod'
import { db } from '../db'
import { config } from '../config'
import { auditAs } from '../audit'
import { ServiceError } from '../errors'
import { isOwner, type IdentityContext } from '../context'
import { optionalUuid, parseInput, requireUuid } from '../validation'
import { sendEmail } from '../integrations/email'
import { issueAuthToken } from './auth'
import { findUserById, normalizeEmail, toUserDto, type UserDto, type UserRow } from './users-repo'

/** Guard: aksi khusus Owner. Penolakan diaudit. */
export async function requireOwner(ctx: IdentityContext, action: string, resourceType?: string, resourceId?: string | null) {
  if (isOwner(ctx)) return
  await auditAs(ctx, { action, resourceType, resourceId, result: 'DENIED', metadata: { reason: 'OWNER_ONLY' } })
  throw new ServiceError('ACCESS_DENIED', 'Akses ditolak. Hanya Owner yang dapat melakukan ini.')
}

const InviteInput = z.object({
  email: z.string().trim().email('email tidak valid'),
  name: z.string().trim().min(1, 'wajib diisi'),
  roleId: z.enum(['OWNER', 'GM', 'DIVISION_USER']),
  divisionId: optionalUuid,
})

export async function inviteUser(ctx: IdentityContext, input: unknown): Promise<UserDto> {
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
