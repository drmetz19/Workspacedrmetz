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
  /** outbox = hanya disimpan di tabel; smtp = dikirim lewat SMTP (default Gmail) + salinan di outbox. */
  get emailProvider(): 'outbox' | 'smtp' {
    return process.env.EMAIL_PROVIDER === 'smtp' ? 'smtp' : 'outbox'
  },
  smtp: {
    get host() { return process.env.SMTP_HOST ?? 'smtp.gmail.com' },
    get port() { return Number(process.env.SMTP_PORT ?? 465) },
    get user() { return process.env.SMTP_USER ?? '' },
    get pass() { return process.env.SMTP_PASS ?? '' },
    get from() { return process.env.EMAIL_FROM ?? `"Dr. Metz Workspace" <${process.env.SMTP_USER ?? ''}>` },
  },
  /**
   * link   = dokumen cukup berupa tautan Drive; izin file diatur setelan berbagi Drive (tanpa akun service, tanpa scan).
   * google = akun service CSSE (scan folder + proxy L3–5).
   * mock   = pengembangan/test.
   */
  get driveMode(): 'link' | 'google' | 'mock' {
    const v = process.env.DRIVE_PROVIDER
    return v === 'link' || v === 'google' ? v : 'mock'
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
