import { db } from '../db'
import type { IdentityContext } from '../context'

export interface DivisionDto {
  divisionId: string
  divisionName: string
  status: 'ACTIVE' | 'INACTIVE'
  managerUserId: string | null
}

/** Daftar divisi (semua user terautentikasi boleh melihat nama divisi). */
export async function listDivisions(_ctx: IdentityContext, opts: { includeInactive?: boolean } = {}): Promise<DivisionDto[]> {
  const rows = await db()<{ division_id: string; division_name: string; status: 'ACTIVE' | 'INACTIVE'; manager_user_id: string | null }[]>`
    select division_id, division_name, status, manager_user_id from divisions
    where ${opts.includeInactive ? db()`true` : db()`status = 'ACTIVE'`}
    order by division_name`
  return rows.map((r) => ({ divisionId: r.division_id, divisionName: r.division_name, status: r.status, managerUserId: r.manager_user_id }))
}
