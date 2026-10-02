import { NextResponse, type NextRequest } from 'next/server'
import { loginWithPassword } from '@/server/services/auth'
import { errorResponse, readBody, redirect303, SESSION_COOKIE, sessionCookieOptions, wantsJson } from '@/server/http'

export async function POST(req: NextRequest) {
  const json = wantsJson(req)
  try {
    const body = await readBody(req)
    const { sessionToken, user, expiresAt } = await loginWithPassword(String(body.email ?? ''), String(body.password ?? ''))
    const res = json
      ? NextResponse.json({ status: 'success', data: { user, sessionToken, expiresAt } })
      : redirect303(req, '/')
    res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(expiresAt))
    return res
  } catch (e) {
    return errorResponse(req, e, json, '/login')
  }
}
