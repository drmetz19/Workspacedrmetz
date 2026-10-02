import postgres from 'postgres'
import { migrate } from '../../src/server/db/migrate'

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres'
const TEST_DB = 'csse_test'

/** Database test dibuat ulang dari nol setiap `pnpm test`, lalu semua migration dijalankan. */
export default async function setup() {
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} })
  await admin.unsafe(`drop database if exists ${TEST_DB} with (force)`)
  await admin.unsafe(`create database ${TEST_DB}`)
  await admin.end()
  await migrate(`postgres://postgres:postgres@localhost:5432/${TEST_DB}`)
}
