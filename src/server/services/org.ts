import { z } from 'zod'
import { db } from '../db'
import { auditAs } from '../audit'
import { ServiceError } from '../errors'
import type { IdentityContext } from '../context'
import { requireOwner } from '../guards'
import { optionalUuid, parseInput, requireUuid } from '../validation'

// ── Divisi ──────────────────────────────────────────────────────────────
export interface DivisionDto {
  divisionId: string
  divisionName: string
  status: 'ACTIVE' | 'INACTIVE'
  managerUserId: string | null
  userCount?: number
}

type DivisionRow = { division_id: string; division_name: string; status: 'ACTIVE' | 'INACTIVE'; manager_user_id: string | null; user_count?: number }
const toDivision = (r: DivisionRow): DivisionDto => ({
  divisionId: r.division_id, divisionName: r.division_name, status: r.status, managerUserId: r.manager_user_id,
  userCount: r.user_count,
})

/** Daftar divisi (semua user terautentikasi boleh melihat nama divisi). */
export async function listDivisions(_ctx: IdentityContext, opts: { includeInactive?: boolean } = {}): Promise<DivisionDto[]> {
  const rows = await db()<DivisionRow[]>`
    select d.division_id, d.division_name, d.status, d.manager_user_id,
      (select count(*)::int from users u where u.division_id = d.division_id and u.status <> 'DEACTIVATED') as user_count
    from divisions d
    where ${opts.includeInactive ? db()`true` : db()`d.status = 'ACTIVE'`}
    order by d.division_name`
  return rows.map(toDivision)
}

const DivisionInput = z.object({
  divisionName: z.string().trim().min(2, 'minimal 2 karakter').max(80),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  managerUserId: optionalUuid,
})

function uniqueViolation(e: unknown) {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505'
}

export async function createDivision(ctx: IdentityContext, input: unknown): Promise<DivisionDto> {
  await requireOwner(ctx, 'DIVISION_CREATED', 'DIVISION')
  const data = parseInput(DivisionInput, input)
  try {
    return await db().begin(async (tx) => {
      const [r] = await tx<DivisionRow[]>`
        insert into divisions (division_name, status, manager_user_id) values (${data.divisionName}, ${data.status}, ${data.managerUserId})
        returning division_id, division_name, status, manager_user_id`
      await auditAs(ctx, { action: 'DIVISION_CREATED', resourceType: 'DIVISION', resourceId: r.division_id, result: 'SUCCESS', metadata: { divisionName: r.division_name } }, tx)
      return toDivision(r)
    })
  } catch (e) {
    if (uniqueViolation(e)) throw new ServiceError('CONFLICT', 'Nama divisi sudah dipakai.')
    throw e
  }
}

export async function updateDivision(ctx: IdentityContext, divisionId: unknown, input: unknown): Promise<DivisionDto> {
  await requireOwner(ctx, 'DIVISION_UPDATED', 'DIVISION', typeof divisionId === 'string' ? divisionId : null)
  const id = requireUuid(divisionId, 'Divisi')
  const data = parseInput(DivisionInput, input)
  const [before] = await db()<DivisionRow[]>`select division_id, division_name, status, manager_user_id from divisions where division_id = ${id}`
  if (!before) throw new ServiceError('NOT_FOUND', 'Divisi tidak ditemukan.')
  try {
    return await db().begin(async (tx) => {
      const [r] = await tx<DivisionRow[]>`
        update divisions set division_name = ${data.divisionName}, status = ${data.status}, manager_user_id = ${data.managerUserId}, updated_at = now()
        where division_id = ${id} returning division_id, division_name, status, manager_user_id`
      await auditAs(ctx, {
        action: 'DIVISION_UPDATED', resourceType: 'DIVISION', resourceId: id, result: 'SUCCESS',
        metadata: { before: { divisionName: before.division_name, status: before.status }, after: { divisionName: r.division_name, status: r.status } },
      }, tx)
      return toDivision(r)
    })
  } catch (e) {
    if (uniqueViolation(e)) throw new ServiceError('CONFLICT', 'Nama divisi sudah dipakai.')
    throw e
  }
}

// ── Kategori ────────────────────────────────────────────────────────────
export interface CategoryDto {
  categoryId: string
  categoryName: string
  status: 'ACTIVE' | 'INACTIVE'
}
type CategoryRow = { category_id: string; category_name: string; status: 'ACTIVE' | 'INACTIVE' }
const toCategory = (r: CategoryRow): CategoryDto => ({ categoryId: r.category_id, categoryName: r.category_name, status: r.status })

export async function listCategories(_ctx: IdentityContext, opts: { includeInactive?: boolean } = {}): Promise<CategoryDto[]> {
  const rows = await db()<CategoryRow[]>`
    select category_id, category_name, status from categories
    where ${opts.includeInactive ? db()`true` : db()`status = 'ACTIVE'`}
    order by case when category_name = 'Lainnya' then 1 else 0 end, category_name`
  return rows.map(toCategory)
}

const CategoryInput = z.object({
  categoryName: z.string().trim().min(2, 'minimal 2 karakter').max(80),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
})

export async function createCategory(ctx: IdentityContext, input: unknown): Promise<CategoryDto> {
  await requireOwner(ctx, 'CATEGORY_CREATED', 'CATEGORY')
  const data = parseInput(CategoryInput, input)
  try {
    return await db().begin(async (tx) => {
      const [r] = await tx<CategoryRow[]>`insert into categories (category_name, status) values (${data.categoryName}, ${data.status}) returning category_id, category_name, status`
      await auditAs(ctx, { action: 'CATEGORY_CREATED', resourceType: 'CATEGORY', resourceId: r.category_id, result: 'SUCCESS', metadata: { categoryName: r.category_name } }, tx)
      return toCategory(r)
    })
  } catch (e) {
    if (uniqueViolation(e)) throw new ServiceError('CONFLICT', 'Nama kategori sudah dipakai.')
    throw e
  }
}

export async function updateCategory(ctx: IdentityContext, categoryId: unknown, input: unknown): Promise<CategoryDto> {
  await requireOwner(ctx, 'CATEGORY_UPDATED', 'CATEGORY', typeof categoryId === 'string' ? categoryId : null)
  const id = requireUuid(categoryId, 'Kategori')
  const data = parseInput(CategoryInput, input)
  const [before] = await db()<CategoryRow[]>`select category_id, category_name, status from categories where category_id = ${id}`
  if (!before) throw new ServiceError('NOT_FOUND', 'Kategori tidak ditemukan.')
  try {
    return await db().begin(async (tx) => {
      const [r] = await tx<CategoryRow[]>`update categories set category_name = ${data.categoryName}, status = ${data.status}, updated_at = now() where category_id = ${id} returning category_id, category_name, status`
      await auditAs(ctx, {
        action: 'CATEGORY_UPDATED', resourceType: 'CATEGORY', resourceId: id, result: 'SUCCESS',
        metadata: { before: { categoryName: before.category_name, status: before.status }, after: { categoryName: r.category_name, status: r.status } },
      }, tx)
      return toCategory(r)
    })
  } catch (e) {
    if (uniqueViolation(e)) throw new ServiceError('CONFLICT', 'Nama kategori sudah dipakai.')
    throw e
  }
}
