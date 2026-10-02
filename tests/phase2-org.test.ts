import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createCategory, createDivision, listCategories, listDivisions, updateCategory, updateDivision } from '@/server/services/org'
import { reactivateUser, updateUser } from '@/server/services/users'
import { getSessionUser, loginWithPassword } from '@/server/services/auth'
import { auditActions, closeDb, createUser, divisionId, resetDb } from './helpers'

beforeEach(resetDb)
afterAll(closeDb)

describe('divisi', () => {
  it('Owner membuat & mengubah divisi; tercatat di audit', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const d = await createDivision(owner, { divisionName: 'Finance' })
    expect(d.divisionName).toBe('Finance')
    const u = await updateDivision(owner, d.divisionId, { divisionName: 'Finance & Akuntansi', status: 'ACTIVE' })
    expect(u.divisionName).toBe('Finance & Akuntansi')
    expect((await auditActions({ action: 'DIVISION_CREATED' })).length).toBe(1)
    expect((await auditActions({ action: 'DIVISION_UPDATED' }))[0].metadata).toMatchObject({ before: { divisionName: 'Finance' } })
  })

  it('Nama divisi duplikat ditolak', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await expect(createDivision(owner, { divisionName: 'Legal/Perizinan' })).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('Divisi nonaktif tidak muncul di daftar default', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const d = await createDivision(owner, { divisionName: 'HR' })
    await updateDivision(owner, d.divisionId, { divisionName: 'HR', status: 'INACTIVE' })
    expect((await listDivisions(owner)).map((x) => x.divisionName)).not.toContain('HR')
    expect((await listDivisions(owner, { includeInactive: true })).map((x) => x.divisionName)).toContain('HR')
  })

  it('GM & Division User tidak bisa mengelola divisi; penolakan diaudit', async () => {
    const gm = await createUser({ role: 'GM' })
    await expect(createDivision(gm, { divisionName: 'X' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    expect((await auditActions({ action: 'DIVISION_CREATED' }))[0].result).toBe('DENIED')
  })
})

describe('kategori', () => {
  it('Kategori seed tersedia', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const names = (await listCategories(owner)).map((c) => c.categoryName)
    expect(names).toEqual(expect.arrayContaining(['Izin Operasional', 'SIP', 'STR', 'Kontrak', 'MoU', 'Sewa', 'Sertifikat', 'Lainnya']))
  })

  it('Owner membuat & mengubah kategori', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const c = await createCategory(owner, { categoryName: 'Akreditasi' })
    const u = await updateCategory(owner, c.categoryId, { categoryName: 'Akreditasi Klinik', status: 'ACTIVE' })
    expect(u.categoryName).toBe('Akreditasi Klinik')
    expect((await auditActions({ action: 'CATEGORY_UPDATED' })).length).toBe(1)
  })

  it('Division User tidak bisa membuat kategori', async () => {
    const staf = await createUser()
    await expect(createCategory(staf, { categoryName: 'Y' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })
})

describe('user: role & divisi', () => {
  it('Owner mengubah role & divisi user; berlaku di sesi berikutnya (dan sesi berjalan)', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const staf = await createUser({ email: 'k@drmetz.test', password: 'benar-12345' })
    const { sessionToken } = await loginWithPassword('k@drmetz.test', 'benar-12345')
    const fin = await createDivision(owner, { divisionName: 'Finance' })
    await updateUser(owner, staf.userId, { roleId: 'DIVISION_USER', divisionId: fin.divisionId, name: 'Staf K' })
    const ctx = await getSessionUser(sessionToken)
    expect(ctx?.divisionId).toBe(fin.divisionId)
    expect(ctx?.name).toBe('Staf K')
    const [a] = await auditActions({ action: 'USER_UPDATED' })
    expect(a.metadata).toMatchObject({ before: { divisionId: await divisionId() }, after: { divisionId: fin.divisionId } })
  })

  it('Owner tidak bisa menurunkan role dirinya sendiri', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await expect(updateUser(owner, owner.userId, { roleId: 'GM', divisionId: '', name: 'x' })).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('Owner mengaktifkan kembali user nonaktif', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const staf = await createUser({ status: 'DEACTIVATED' })
    await reactivateUser(owner, staf.userId)
    expect((await auditActions({ action: 'USER_REACTIVATED' })).length).toBe(1)
  })

  it('GM tidak bisa mengubah user', async () => {
    const gm = await createUser({ role: 'GM' })
    const staf = await createUser()
    await expect(updateUser(gm, staf.userId, { roleId: 'GM', divisionId: '', name: 'x' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })
})
