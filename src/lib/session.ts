import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/server/services/auth'
import { SESSION_COOKIE } from '@/server/http'
import type { IdentityContext } from '@/server/context'

export const currentUser = cache(async (): Promise<IdentityContext | null> => {
  const store = await cookies()
  return getSessionUser(store.get(SESSION_COOKIE)?.value)
})

/** Untuk halaman: wajib login, kalau tidak → /login. */
export async function requireUser(): Promise<IdentityContext> {
  const ctx = await currentUser()
  if (!ctx) redirect('/login')
  return ctx
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function sp(searchParams: SearchParams) {
  const raw = await searchParams
  const get = (k: string) => {
    const v = raw[k]
    return Array.isArray(v) ? v[0] : v
  }
  return { raw, get }
}
