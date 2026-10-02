import type { NextRequest } from 'next/server'
import { identityProvider } from '@/server/integrations/identity'
import { loginWithGoogle } from '@/server/services/auth'
import { ServiceError } from '@/server/errors'
import { errorResponse, publicOrigin, redirect303, SESSION_COOKIE, sessionCookieOptions } from '@/server/http'

const OAUTH_COOKIE = 'csse_oauth'

export async function GET(req: NextRequest) {
  try {
    const [state, verifier] = (req.cookies.get(OAUTH_COOKIE)?.value ?? '').split('.')
    if (!state || state !== req.nextUrl.searchParams.get('state')) {
      throw new ServiceError('INVALID_TOKEN', 'Sesi login Google tidak valid. Silakan ulangi.')
    }
    const identity = await identityProvider().googleCallback({
      params: req.nextUrl.searchParams,
      redirectUri: `${publicOrigin(req)}/api/auth/google/callback`,
      codeVerifier: verifier,
    })
    const { sessionToken, expiresAt } = await loginWithGoogle(identity)
    const res = redirect303(req, '/')
    res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(expiresAt))
    res.cookies.delete(OAUTH_COOKIE)
    return res
  } catch (e) {
    const res = errorResponse(req, e, false, '/login')
    res.cookies.delete(OAUTH_COOKIE)
    return res
  }
}
