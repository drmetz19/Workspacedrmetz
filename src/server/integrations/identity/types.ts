/** Kontrak identity provider. CSSE memegang undangan, sesi, lockout, dan audit; provider hanya memverifikasi identitas. */
export interface VerifiedIdentity {
  email: string
  emailVerified: boolean
}

export interface GoogleStartParams {
  state: string
  redirectUri: string
  codeChallenge: string
}

export interface GoogleCallbackParams {
  params: URLSearchParams
  redirectUri: string
  codeVerifier: string
}

export interface IdentityProvider {
  readonly name: 'local' | 'supabase'
  verifyPassword(email: string, password: string): Promise<boolean>
  setPassword(email: string, password: string): Promise<void>
  googleAuthorizeUrl(p: GoogleStartParams): string
  googleCallback(p: GoogleCallbackParams): Promise<VerifiedIdentity>
}
