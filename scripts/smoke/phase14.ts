import net from 'node:net'
import { Client, Smoke, divisionIdByName, OWNER_EMAIL } from './lib'

const SMTP_PORT = 2526
const SENDER = 'projectcuan15@gmail.com'

/** Server dijalankan dengan EMAIL_PROVIDER=smtp yang diarahkan ke server SMTP tiruan lokal. */
export const serverEnv = {
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: String(SMTP_PORT),
  SMTP_USER: SENDER,
  SMTP_PASS: 'app-password-smoke',
}

interface Mail { from: string; to: string[]; data: string; authed: boolean }

/** Server SMTP minimal (EHLO, AUTH PLAIN/LOGIN, MAIL, RCPT, DATA) untuk menangkap email. */
function startFakeSmtp(): Promise<{ mails: Mail[]; close: () => Promise<void> }> {
  const mails: Mail[] = []
  const server = net.createServer((sock) => {
    let cur: Mail = { from: '', to: [], data: '', authed: false }
    let inData = false
    let loginStep = 0
    let buf = ''
    sock.write('220 fake-smtp ready\r\n')
    sock.on('data', (chunk) => {
      buf += chunk.toString()
      let idx
      while ((idx = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        if (inData) {
          if (line === '.') {
            inData = false
            mails.push(cur)
            cur = { from: '', to: [], data: '', authed: cur.authed }
            sock.write('250 OK queued\r\n')
          } else cur.data += line + '\n'
          continue
        }
        if (loginStep === 1) { loginStep = 2; sock.write('334 UGFzc3dvcmQ6\r\n'); continue }
        if (loginStep === 2) { loginStep = 0; cur.authed = true; sock.write('235 Authenticated\r\n'); continue }
        const cmd = line.toUpperCase()
        if (cmd.startsWith('EHLO')) sock.write('250-fake-smtp\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n')
        else if (cmd.startsWith('HELO')) sock.write('250 OK\r\n')
        else if (cmd.startsWith('AUTH PLAIN')) { cur.authed = true; sock.write('235 Authenticated\r\n') }
        else if (cmd.startsWith('AUTH LOGIN')) { loginStep = 1; sock.write('334 VXNlcm5hbWU6\r\n') }
        else if (cmd.startsWith('MAIL FROM')) { cur.from = line.slice(10).trim(); sock.write('250 OK\r\n') }
        else if (cmd.startsWith('RCPT TO')) { cur.to.push(line.slice(8).trim()); sock.write('250 OK\r\n') }
        else if (cmd === 'DATA') { inData = true; sock.write('354 End with .\r\n') }
        else if (cmd === 'QUIT') { sock.write('221 Bye\r\n'); sock.end() }
        else sock.write('250 OK\r\n')
      }
    })
    sock.on('error', () => {})
  })
  return new Promise((resolve) => {
    server.listen(SMTP_PORT, '127.0.0.1', () =>
      resolve({ mails, close: () => new Promise((r) => server.close(() => r())) }))
  })
}

export default async function phase14(t: Smoke) {
  const smtp = await startFakeSmtp()
  try {
    const owner = new Client('owner')
    await owner.loginGoogle(OWNER_EMAIL)
    const legal = (await divisionIdByName('Legal/Perizinan'))!
    const inv = await owner.post('/api/admin/users', { email: 'staf.baru@drmetz.test', name: 'Staf Baru', roleId: 'DIVISION_USER', divisionId: legal })
    t.check('Owner mengundang user baru', inv.status === 303)

    for (let i = 0; i < 40 && smtp.mails.length === 0; i++) await new Promise((r) => setTimeout(r, 100))
    const mail = smtp.mails[0]
    t.check('Email undangan terkirim lewat SMTP (terautentikasi)', !!mail && mail.authed)
    t.check(`Pengirim ${SENDER} dengan nama "Dr. Metz Workspace"`, !!mail && mail.from.includes(SENDER) && /From: "?Dr\. Metz Workspace"?/.test(mail.data))
    t.check('Penerima = email yang diundang', !!mail && mail.to.some((r) => r.includes('staf.baru@drmetz.test')))
    t.check('Isi email berisi tautan undangan aplikasi', !!mail && /set-password|invite|token=/i.test(mail.data.replace(/=\n/g, '')))
  } finally {
    await smtp.close()
  }
}
