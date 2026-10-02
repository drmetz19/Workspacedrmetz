import postgres from 'postgres'
import { config } from '../config'

export type Sql = postgres.Sql
export type Tx = postgres.TransactionSql

const globalForDb = globalThis as unknown as { __csseSql?: Sql; __csseSqlUrl?: string }

/** Pool koneksi tunggal per proses (aman untuk hot reload Next dev). */
export function db(): Sql {
  const url = config.databaseUrl
  if (!globalForDb.__csseSql || globalForDb.__csseSqlUrl !== url) {
    globalForDb.__csseSql = postgres(url, {
      max: 10,
      onnotice: () => {},
      types: {
        bigint: postgres.BigInt,
        // kolom `date` dikembalikan apa adanya (YYYY-MM-DD) agar tidak bergeser zona waktu
        date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      },
    })
    globalForDb.__csseSqlUrl = url
  }
  return globalForDb.__csseSql
}

export async function closeDb() {
  if (globalForDb.__csseSql) {
    await globalForDb.__csseSql.end({ timeout: 5 })
    globalForDb.__csseSql = undefined
  }
}

/**
 * Menjalankan query atas nama user dengan role `csse_app_user` sehingga Row Level Security berlaku.
 * Lapisan pertahanan kedua — keputusan utama tetap di permission engine service layer.
 */
export async function withUserScope<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().begin(async (tx) => {
    await tx`select set_config('csse.user_id', ${userId}, true)`
    await tx.unsafe('set local role csse_app_user')
    return fn(tx)
  }) as Promise<T>
}
