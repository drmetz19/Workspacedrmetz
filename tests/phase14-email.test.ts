import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import { sendEmail, setEmailTransportForTest, type EmailTransport } from '@/server/integrations/email'
import { closeDb, resetDb } from './helpers'

const keys = ['EMAIL_PROVIDER', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'] as const
const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
let sent: Parameters<EmailTransport['sendMail']>[0][] = []

beforeEach(async () => {
  await resetDb()
  sent = []
  process.env.EMAIL_PROVIDER = 'smtp'
  process.env.SMTP_USER = 'projectcuan15@gmail.com'
  process.env.SMTP_PASS = 'app-password-test'
  delete process.env.EMAIL_FROM
  setEmailTransportForTest({ sendMail: async (m) => { sent.push(m) } })
})
afterEach(() => {
  setEmailTransportForTest(null)
  for (const k of keys) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})
afterAll(closeDb)

async function outbox() {
  return db()<{ to_email: string; subject: string }[]>`select to_email, subject from email_outbox`
}

describe('Email via Gmail SMTP (EMAIL_PROVIDER=smtp)', () => {
  it('Terkirim dari projectcuan15@gmail.com dan tetap tercatat di outbox', async () => {
    await sendEmail({ to: 'staf@klinik.id', subject: 'Undangan', body: 'Halo' })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ to: 'staf@klinik.id', subject: 'Undangan', text: 'Halo' })
    expect(sent[0].from).toContain('projectcuan15@gmail.com')
    expect(sent[0].from).toContain('Dr. Metz Workspace')
    expect((await outbox()).map((o) => o.to_email)).toEqual(['staf@klinik.id'])
  })

  it('Gagal kirim tidak menggagalkan alur (tetap ada di outbox)', async () => {
    setEmailTransportForTest({ sendMail: async () => { throw new Error('SMTP down') } })
    await expect(sendEmail({ to: 'staf@klinik.id', subject: 'Reset', body: 'x' })).resolves.toBeUndefined()
    expect(await outbox()).toHaveLength(1)
  })

  it('SMTP belum dikonfigurasi (tanpa app password) → hanya outbox', async () => {
    delete process.env.SMTP_PASS
    await sendEmail({ to: 'staf@klinik.id', subject: 'Undangan', body: 'x' })
    expect(sent).toHaveLength(0)
    expect(await outbox()).toHaveLength(1)
  })
})
