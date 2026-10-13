import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { changeDefaultPassword, completePasswordToken, getSessionUser, loginWithPassword, requestPasswordReset } from '@/server/services/auth'
import { defaultPasswordFor, inviteUser, setDefaultPassword, setDefaultPasswordsForPending } from '@/server/services/users'
import { auditActions, closeDb, createUser, divisionId, lastEmailTo, resetDb, tokenFromEmail } from './helpers'

beforeEach(resetDb)
afterAll(closeDb)

describe('pola password default', () => {
  it('kata pertama nama divisi + @DrMetz2026', () => {
    expect(defaultPasswordFor('Legal/Perizinan')).toBe('Legal@DrMetz2026')
    expect(defaultPasswordFor('HRD')).toBe('HRD@DrMetz2026')
    expect(defaultPasswordFor('finance')).toBe('Finance@DrMetz2026')
    expect(defaultPasswordFor(null)).toBe('Staf@DrMetz2026')
  })
})

describe('akun divisi dengan password default', () => {
  it('Owner menambah staf → staf langsung masuk dengan email + password default, lalu wajib ganti', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const div = await divisionId('Finance')
    const u = await inviteUser(owner, { email: 'fin@klinik.id', name: 'Staf Finance', roleId: 'DIVISION_USER', divisionId: div, loginMode: 'DEFAULT_PASSWORD' })
    expect(u.defaultPassword).toBe('Finance@DrMetz2026')
    const mail = await lastEmailTo('fin@klinik.id')
    expect(mail.body).toContain('Finance@DrMetz2026')
    expect(mail.body).not.toContain('token=')

    const login = await loginWithPassword('fin@klinik.id', 'Finance@DrMetz2026')
    const ctx = await getSessionUser(login.sessionToken)
    expect(ctx?.mustChangePassword).toBe(true)

    await expect(changeDefaultPassword(ctx!, 'pendek')).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(changeDefaultPassword(ctx!, 'Finance@DrMetz2026')).rejects.toMatchObject({ code: 'VALIDATION' })
    await changeDefaultPassword(ctx!, 'rahasia-baru-123')
    expect((await getSessionUser(login.sessionToken))?.mustChangePassword).toBe(false)

    await expect(loginWithPassword('fin@klinik.id', 'Finance@DrMetz2026')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    await loginWithPassword('fin@klinik.id', 'rahasia-baru-123')
    expect((await auditActions({ action: 'PASSWORD_CHANGED' })).length).toBe(1)
  })

  it('Owner mengaktifkan password default massal untuk Division User yang belum pernah masuk', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await createUser({ email: 'hrd@klinik.id', status: 'INVITED', division: 'HRD' })
    await createUser({ email: 'sales@klinik.id', status: 'INVITED', division: 'Sales' })
    await createUser({ email: 'aktif@klinik.id', status: 'ACTIVE', division: 'Sales', password: 'milik-sendiri-1' })
    await createUser({ email: 'gm@klinik.id', role: 'GM', status: 'INVITED' })

    expect(await setDefaultPasswordsForPending(owner)).toEqual({ count: 2 })
    await loginWithPassword('hrd@klinik.id', 'HRD@DrMetz2026')
    await loginWithPassword('sales@klinik.id', 'Sales@DrMetz2026')
    // user yang sudah punya password sendiri tidak disentuh
    await loginWithPassword('aktif@klinik.id', 'milik-sendiri-1')
    const [gm] = await db()`select must_change_password from users where email = 'gm@klinik.id'`
    expect(gm.must_change_password).toBe(false)
    // klik kedua tidak mereset ulang user yang sudah mendapat password default
    expect(await setDefaultPasswordsForPending(owner)).toEqual({ count: 0 })
  })

  it('Reset ke password default mencabut sesi lama; hanya untuk Division User; hanya Owner', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const gm = await createUser({ role: 'GM' })
    const staf = await createUser({ email: 'legal@klinik.id', password: 'lama-12345' })
    const old = await loginWithPassword('legal@klinik.id', 'lama-12345')

    await expect(setDefaultPassword(gm, staf.userId)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    await expect(setDefaultPassword(owner, gm.userId)).rejects.toMatchObject({ code: 'VALIDATION' })

    const r = await setDefaultPassword(owner, staf.userId)
    expect(r.password).toBe('Legal@DrMetz2026')
    expect(await getSessionUser(old.sessionToken)).toBeNull()
    const fresh = await loginWithPassword('legal@klinik.id', 'Legal@DrMetz2026')
    expect((await getSessionUser(fresh.sessionToken))?.mustChangePassword).toBe(true)
  })

  it('Reset password lewat email juga menghapus kewajiban ganti password', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const staf = await createUser({ email: 'ops@klinik.id', status: 'INVITED', division: 'Operasional' })
    await setDefaultPassword(owner, staf.userId)
    await requestPasswordReset('ops@klinik.id')
    await completePasswordToken(tokenFromEmail((await lastEmailTo('ops@klinik.id')).body), 'pilihan-saya-1')
    const s = await loginWithPassword('ops@klinik.id', 'pilihan-saya-1')
    expect((await getSessionUser(s.sessionToken))?.mustChangePassword).toBe(false)
  })

  it('Mode tautan undangan tetap tersedia', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const u = await inviteUser(owner, { email: 'link@klinik.id', name: 'L', roleId: 'DIVISION_USER', divisionId: await divisionId(), loginMode: 'INVITE_LINK' })
    expect(u.defaultPassword).toBeUndefined()
    expect((await lastEmailTo('link@klinik.id')).body).toContain('/invite/accept?token=')
  })
})
