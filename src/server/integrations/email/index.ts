import nodemailer from 'nodemailer'
import { db } from '../../db'
import { config } from '../../config'

export interface EmailMessage {
  to: string
  subject: string
  body: string
}

/** Antarmuka minimal transport (nodemailer) — bisa diganti di test. */
export interface EmailTransport {
  sendMail(m: { from: string; to: string; subject: string; text: string }): Promise<unknown>
}

let override: EmailTransport | null = null
let cached: { key: string; transport: EmailTransport } | null = null

export function setEmailTransportForTest(t: EmailTransport | null) {
  override = t
}

function smtpTransport(): EmailTransport | null {
  const { host, port, user, pass } = config.smtp
  if (!user || !pass) return null
  if (override) return override
  const key = `${host}:${port}:${user}`
  if (!cached || cached.key !== key) {
    cached = { key, transport: nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } }) }
  }
  return cached.transport
}

/**
 * Adapter email.
 * - outbox (default): email disimpan di tabel email_outbox.
 * - smtp: dikirim lewat SMTP (default Gmail, pengirim SMTP_USER mis. projectcuan15@gmail.com) dan salinannya tetap
 *   disimpan di outbox sebagai jejak. Kegagalan kirim tidak menggagalkan alur (undangan/reset tetap tercatat).
 */
export async function sendEmail(msg: EmailMessage) {
  await db()`insert into email_outbox (to_email, subject, body) values (${msg.to}, ${msg.subject}, ${msg.body})`
  const quiet = process.env.NODE_ENV === 'test'
  if (config.emailProvider !== 'smtp') {
    if (!quiet) console.info(`[email:outbox] → ${msg.to} · ${msg.subject}`)
    return
  }
  const transport = smtpTransport()
  if (!transport) {
    if (!quiet) console.warn(`[email:smtp] SMTP_USER/SMTP_PASS belum di-set — hanya disimpan di outbox → ${msg.to}`)
    return
  }
  try {
    await transport.sendMail({ from: config.smtp.from, to: msg.to, subject: msg.subject, text: msg.body })
    if (!quiet) console.info(`[email:smtp] → ${msg.to} · ${msg.subject}`)
  } catch (e) {
    console.error(`[email:smtp] gagal kirim ke ${msg.to}:`, e instanceof Error ? e.message : e)
  }
}
