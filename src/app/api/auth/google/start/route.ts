import { config } from '@/server/config'
import { NextResponse, type NextRequest } from 'next/server'
import { identityProvider } from '@/server/integrations/identity'
import { newToken, pkceChallenge } from '@/server/crypto'
import { errorResponse, publicOrigin } from '@/server/http'

const OAUTH_COOKIE = 'csse_oauth'

export async function GET(req: NextRequest) {
  try {
    const state = newToken()
    const verifier = newToken()
    const redirectUri = `${publicOrigin(req)}/api/auth/google/callback`
    const url = identityProvider().googleAuthorizeUrl({ state, redirectUri, codeChallenge: pkceChallenge(verifier) })
    const res = NextResponse.redirect(url, 303)
    res.cookies.set(OAUTH_COOKIE, `${state}.${verifier}`, {
      httpOnly: true, sameSite: 'lax', secure: config.appUrl.startsWith('https:'), path: '/', maxAge: 600,
    })
    return res
  } catch (e) {
    return errorResponse(req, e, false, '/login')
  }
}
