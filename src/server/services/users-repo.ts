import type { Sql, Tx } from '../db'
import type { RoleId } from '../context'

export interface UserRow {
  user_id: string
  email: string
  name: string
  role_id: RoleId
  division_id: string | null
  status: 'INVITED' | 'ACTIVE' | 'DEACTIVATED'
  failed_login_count: number
  locked_until: Date | null
  last_login_at: Date | null
  drmetz_identity_id: string | null
  created_at: Date
}

export interface UserDto {
  userId: string
  email: string
  name: string
  roleId: RoleId
  divisionId: string | null
  status: UserRow['status']
  lastLoginAt: Date | null
  drmetzIdentityId: string | null
}

export const toUserDto = (r: UserRow): UserDto => ({
  userId: r.user_id,
  email: r.email,
  name: r.name,
  roleId: r.role_id,
  divisionId: r.division_id,
  status: r.status,
  lastLoginAt: r.last_login_at,
  drmetzIdentityId: r.drmetz_identity_id,
})

export async function findUserByEmail(q: Sql | Tx, email: string) {
  const [row] = await q<UserRow[]>`select * from users where email = ${email}`
  return row ?? null
}

export async function findUserById(q: Sql | Tx, id: string) {
  const [row] = await q<UserRow[]>`select * from users where user_id = ${id}`
  return row ?? null
}

export const normalizeEmail = (e: string) => e.trim().toLowerCase()
