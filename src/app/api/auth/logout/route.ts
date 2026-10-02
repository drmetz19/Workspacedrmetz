import type { NextRequest } from 'next/server'
import { logout } from '@/server/services/auth'
import { redirect303, SESSION_COOKIE, tokenFromRequest } from '@/server/http'

export async function POST(req: NextRequest) {
  const token = tokenFromRequest(req)
  if (token) await logout(token)
  const res = redirect303(req, '/login', { msg: 'Anda sudah keluar.' })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
