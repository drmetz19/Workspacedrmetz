import postgres from 'postgres'
import { loadEnv } from './env'

loadEnv()

/** Membuat Owner pertama bila belum ada (bootstrap). Idempoten. */
async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
  try {
    const email = (process.env.CSSE_BOOTSTRAP_OWNER_EMAIL ?? '').trim().toLowerCase()
    const name = process.env.CSSE_BOOTSTRAP_OWNER_NAME ?? 'Owner'
    if (!email) throw new Error('CSSE_BOOTSTRAP_OWNER_EMAIL belum di-set')
    const [owner] = await sql`select email from users where role_id = 'OWNER' and status <> 'DEACTIVATED' limit 1`
    if (owner) {
      console.log(`Owner sudah ada: ${owner.email}`)
      return
    }
    await sql`insert into users (email, name, role_id, status) values (${email}, ${name}, 'OWNER', 'INVITED')
              on conflict (email) do update set role_id = 'OWNER', status = 'INVITED'`
    await sql`insert into audit_events (actor_email, action, resource_type, result, source, metadata)
              values (${email}, 'OWNER_BOOTSTRAPPED', 'USER', 'SUCCESS', 'SYSTEM', ${sql.json({ email })})`
    console.log(`Owner dibuat: ${email} — masuk dengan Google.`)
  } finally {
    await sql.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
