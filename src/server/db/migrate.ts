import fs from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'

export const MIGRATIONS_DIR = path.resolve(process.cwd(), 'db/migrations')

/** Menjalankan semua migration .sql yang belum diterapkan, berurutan, masing-masing dalam transaksi. */
export async function migrate(databaseUrl: string, log: (m: string) => void = () => {}) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
  try {
    await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`
    const applied = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name))
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
    for (const file of files) {
      if (applied.has(file)) continue
      const body = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      await sql.begin(async (tx) => {
        await tx.unsafe(body)
        await tx`insert into schema_migrations (name) values (${file})`
      })
      log(`applied ${file}`)
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}
