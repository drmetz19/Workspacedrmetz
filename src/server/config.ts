/** Konfigurasi dari environment. Dibaca saat dipakai (bukan saat import) agar test bisa mengubahnya. */
export const config = {
  get databaseUrl() {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL belum di-set')
    return url
  },
  get appUrl() {
    return process.env.APP_URL ?? 'http://localhost:3000'
  },
  get identityProvider(): 'local' | 'supabase' {
    return process.env.IDENTITY_PROVIDER === 'supabase' ? 'supabase' : 'local'
  },
  get allowDevIdp() {
    return process.env.CSSE_ALLOW_DEV_IDP === '1'
  },
  get emailProvider(): 'outbox' {
    return 'outbox'
  },
  supabase: {
    get url() { return process.env.SUPABASE_URL ?? '' },
    get anonKey() { return process.env.SUPABASE_ANON_KEY ?? '' },
    get serviceRoleKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY ?? '' },
  },
  /** Kebijakan login */
  auth: {
    maxFailedAttempts: 5,
    lockMinutes: 15,
    sessionHours: 12,
    inviteTokenHours: 72,
    resetTokenMinutes: 60,
  },
}
