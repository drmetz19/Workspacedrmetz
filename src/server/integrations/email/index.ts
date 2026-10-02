import { db } from '../../db'

export interface EmailMessage {
  to: string
  subject: string
  body: string
}

/**
 * Adapter email. MVP: "outbox" — email disimpan di tabel email_outbox (dan dicetak ke log).
 * DECISION REQUIRED (produksi): penyedia email transaksional (mis. SMTP Workspace / Resend).
 */
export async function sendEmail(msg: EmailMessage) {
  await db()`insert into email_outbox (to_email, subject, body) values (${msg.to}, ${msg.subject}, ${msg.body})`
  if (process.env.NODE_ENV !== 'test') console.info(`[email:outbox] → ${msg.to} · ${msg.subject}`)
}
