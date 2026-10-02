import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import {
  completePasswordToken,
  getSessionUser,
  loginWithGoogle,
  loginWithPassword,
  logout,
  requestPasswordReset,
} from '@/server/services/auth'
import { deactivateUser, inviteUser, listUsers } from '@/server/services/users'
import { auditActions, closeDb, createUser, divisionId, lastEmailTo, resetDb, tokenFromEmail } from './helpers'

beforeEach(resetDb)
afterAll(closeDb)

describe('undangan', () => {
  it('Owner mengundang user; user INVITED menerima email berisi tautan set password', async () => {
    const owner = await createUser({ role: 'OWNER', email: 'owner@drmetz.test' })
    const div = await divisionId()
    const user = await inviteUser(owner, { email: 'Staf@Klinik.id', name: 'Staf Legal', roleId: 'DIVISION_USER', divisionId: div })
    expect(user.email).toBe('staf@klinik.id')
    expect(user.status).toBe('INVITED')
    expect(user.userId).toMatch(/^[0-9a-f-]{36}$/)
    const mail = await lastEmailTo('staf@klinik.id')
    expect(mail.body).toContain('/invite/accept?token=')
    const [a] = await auditActions({ action: 'USER_INVITED' })
    expect(a.result).toBe('SUCCESS')
  })

  it('Undangan untuk GM tidak berisi tautan password (wajib Google)', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await inviteUser(owner, { email: 'gm@drmetz.test', name: 'GM', roleId: 'GM', divisionId: null })
    const mail = await lastEmailTo('gm@drmetz.test')
    expect(mail.body).not.toContain('token=')
    expect(mail.body).toContain('Google')
  })

  it('Hanya Owner yang boleh mengundang', async () => {
    const gm = await createUser({ role: 'GM' })
    await expect(inviteUser(gm, { email: 'x@y.id', name: 'X', roleId: 'DIVISION_USER', divisionId: null })).rejects.toMatchObject({
      code: 'ACCESS_DENIED',
    })
    const [a] = await auditActions({ action: 'USER_INVITED' })
    expect(a.result).toBe('DENIED')
  })

  it('Email yang sudah terdaftar ditolak (CONFLICT)', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await createUser({ email: 'dup@drmetz.test' })
    await expect(inviteUser(owner, { email: 'dup@drmetz.test', name: 'D', roleId: 'DIVISION_USER', divisionId: null })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('drmetz_identity_id tersedia dan nullable', async () => {
    const u = await createUser()
    const [row] = await db()`select drmetz_identity_id from users where user_id = ${u.userId}`
    expect(row.drmetz_identity_id).toBeNull()
  })
})

describe('login password', () => {
  it('User diundang set password via token undangan lalu login → sesi aktif, status ACTIVE', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await inviteUser(owner, { email: 'staf@drmetz.test', name: 'Staf', roleId: 'DIVISION_USER', divisionId: await divisionId() })
    const token = tokenFromEmail((await lastEmailTo('staf@drmetz.test')).body)
    await completePasswordToken(token, 'rahasia-123')
    const { sessionToken, user } = await loginWithPassword('staf@drmetz.test', 'rahasia-123')
    expect(user.roleId).toBe('DIVISION_USER')
    const ctx = await getSessionUser(sessionToken)
    expect(ctx?.email).toBe('staf@drmetz.test')
    const [row] = await db()`select status from users where email = 'staf@drmetz.test'`
    expect(row.status).toBe('ACTIVE')
    const [a] = await auditActions({ action: 'LOGIN_SUCCEEDED' })
    expect(a.metadata).toMatchObject({ method: 'PASSWORD' })
  })

  it('Token undangan hanya bisa dipakai sekali', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await inviteUser(owner, { email: 'a@drmetz.test', name: 'A', roleId: 'DIVISION_USER', divisionId: null })
    const token = tokenFromEmail((await lastEmailTo('a@drmetz.test')).body)
    await completePasswordToken(token, 'rahasia-123')
    await expect(completePasswordToken(token, 'lain-12345')).rejects.toMatchObject({ code: 'INVALID_TOKEN' })
  })

  it('Password terlalu pendek ditolak', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await inviteUser(owner, { email: 'b@drmetz.test', name: 'B', roleId: 'DIVISION_USER', divisionId: null })
    const token = tokenFromEmail((await lastEmailTo('b@drmetz.test')).body)
    await expect(completePasswordToken(token, 'pendek')).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('Email tidak diundang ditolak + audit LOGIN_REJECTED', async () => {
    await expect(loginWithPassword('asing@gmail.com', 'apapun123')).rejects.toMatchObject({ code: 'NOT_INVITED' })
    const [a] = await auditActions({ action: 'LOGIN_REJECTED' })
    expect(a.actor_email).toBe('asing@gmail.com')
    expect(a.metadata).toMatchObject({ reason: 'NOT_INVITED', method: 'PASSWORD' })
  })

  it('Owner/GM tidak boleh login dengan password', async () => {
    await createUser({ role: 'GM', email: 'gm@drmetz.test', password: 'rahasia-123' })
    await expect(loginWithPassword('gm@drmetz.test', 'rahasia-123')).rejects.toMatchObject({ code: 'METHOD_NOT_ALLOWED' })
    await createUser({ role: 'OWNER', email: 'own@drmetz.test', password: 'rahasia-123' })
    await expect(loginWithPassword('own@drmetz.test', 'rahasia-123')).rejects.toMatchObject({ code: 'METHOD_NOT_ALLOWED' })
  })

  it('Password salah → LOGIN_FAILED; setelah 5x akun terkunci, password benar pun ditolak', async () => {
    await createUser({ email: 'c@drmetz.test', password: 'benar-12345' })
    for (let i = 0; i < 5; i++) {
      await expect(loginWithPassword('c@drmetz.test', 'salah')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    }
    await expect(loginWithPassword('c@drmetz.test', 'benar-12345')).rejects.toMatchObject({ code: 'LOCKED' })
    expect((await auditActions({ action: 'LOGIN_FAILED' })).length).toBe(5)
    expect((await auditActions({ action: 'ACCOUNT_LOCKED' })).length).toBe(1)
  })

  it('Kunci kedaluwarsa → bisa login lagi dan counter direset', async () => {
    await createUser({ email: 'd@drmetz.test', password: 'benar-12345' })
    await db()`update users set failed_login_count = 5, locked_until = now() - interval '1 minute' where email = 'd@drmetz.test'`
    await loginWithPassword('d@drmetz.test', 'benar-12345')
    const [row] = await db()`select failed_login_count from users where email = 'd@drmetz.test'`
    expect(row.failed_login_count).toBe(0)
  })

  it('User nonaktif ditolak dengan pesan akun dinonaktifkan', async () => {
    await createUser({ email: 'e@drmetz.test', password: 'benar-12345', status: 'DEACTIVATED' })
    await expect(loginWithPassword('e@drmetz.test', 'benar-12345')).rejects.toMatchObject({
      code: 'DEACTIVATED',
      message: expect.stringContaining('dinonaktifkan'),
    })
  })
})

describe('login Google', () => {
  it('Owner login Google berhasil', async () => {
    await createUser({ role: 'OWNER', email: 'owner@drmetz.test' })
    const { sessionToken } = await loginWithGoogle({ email: 'owner@drmetz.test', emailVerified: true })
    expect((await getSessionUser(sessionToken))?.roleId).toBe('OWNER')
  })

  it('Gmail pribadi yang diundang bisa login Google', async () => {
    await createUser({ email: 'staf.pribadi@gmail.com', status: 'INVITED' })
    const { user } = await loginWithGoogle({ email: 'Staf.Pribadi@gmail.com', emailVerified: true })
    expect(user.email).toBe('staf.pribadi@gmail.com')
  })

  it('Email Google tak diundang ditolak + diaudit', async () => {
    await expect(loginWithGoogle({ email: 'random@gmail.com', emailVerified: true })).rejects.toMatchObject({ code: 'NOT_INVITED' })
    const [a] = await auditActions({ action: 'LOGIN_REJECTED' })
    expect(a.metadata).toMatchObject({ method: 'GOOGLE' })
  })

  it('Email Google belum terverifikasi ditolak', async () => {
    await createUser({ email: 'f@drmetz.test' })
    await expect(loginWithGoogle({ email: 'f@drmetz.test', emailVerified: false })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })
})

describe('reset password', () => {
  it('Reset mengirim email bertoken; token mengganti password', async () => {
    await createUser({ email: 'g@drmetz.test', password: 'lama-123456' })
    await requestPasswordReset('g@drmetz.test')
    const token = tokenFromEmail((await lastEmailTo('g@drmetz.test')).body)
    await completePasswordToken(token, 'baru-123456')
    await expect(loginWithPassword('g@drmetz.test', 'lama-123456')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    await loginWithPassword('g@drmetz.test', 'baru-123456')
  })

  it('Reset untuk email tak dikenal tidak error dan tidak mengirim email (anti enumerasi)', async () => {
    await requestPasswordReset('siapa@gmail.com')
    expect(await lastEmailTo('siapa@gmail.com')).toBeUndefined()
  })

  it('Reset juga membuka kunci akun', async () => {
    await createUser({ email: 'h@drmetz.test', password: 'lama-123456' })
    await db()`update users set failed_login_count = 5, locked_until = now() + interval '10 minutes' where email = 'h@drmetz.test'`
    await requestPasswordReset('h@drmetz.test')
    await completePasswordToken(tokenFromEmail((await lastEmailTo('h@drmetz.test')).body), 'baru-123456')
    await loginWithPassword('h@drmetz.test', 'baru-123456')
  })
})

describe('sesi & nonaktifkan', () => {
  it('Logout mencabut sesi', async () => {
    await createUser({ email: 'i@drmetz.test', password: 'benar-12345' })
    const { sessionToken } = await loginWithPassword('i@drmetz.test', 'benar-12345')
    await logout(sessionToken)
    expect(await getSessionUser(sessionToken)).toBeNull()
  })

  it('Token sesi palsu → null', async () => {
    expect(await getSessionUser('palsu')).toBeNull()
  })

  it('Owner menonaktifkan user → sesi aktif user langsung tidak berlaku', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const staf = await createUser({ email: 'j@drmetz.test', password: 'benar-12345' })
    const { sessionToken } = await loginWithPassword('j@drmetz.test', 'benar-12345')
    await deactivateUser(owner, staf.userId)
    expect(await getSessionUser(sessionToken)).toBeNull()
    const [a] = await auditActions({ action: 'USER_DEACTIVATED' })
    expect(a.resource_id).toBe(staf.userId)
  })

  it('Owner tidak bisa menonaktifkan dirinya sendiri; non-Owner tidak bisa menonaktifkan siapa pun', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await expect(deactivateUser(owner, owner.userId)).rejects.toMatchObject({ code: 'VALIDATION' })
    const gm = await createUser({ role: 'GM' })
    const staf = await createUser()
    await expect(deactivateUser(gm, staf.userId)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })

  it('listUsers hanya untuk Owner', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await createUser()
    expect((await listUsers(owner)).length).toBe(2)
    const staf = await createUser()
    await expect(listUsers(staf)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })
})
