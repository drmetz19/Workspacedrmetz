import { notFound } from 'next/navigation'
import { config } from '@/server/config'
import { sp, type SearchParams } from '@/lib/session'
import { AuthCard } from '@/components/AuthCard'

/** Simulasi layar akun Google — hanya aktif dengan IDENTITY_PROVIDER=local dan CSSE_ALLOW_DEV_IDP=1. */
export default async function DevGoogleLogin({ searchParams }: { searchParams: SearchParams }) {
  if (config.identityProvider !== 'local' || !config.allowDevIdp) notFound()
  const { get } = await sp(searchParams)
  return (
    <AuthCard title="Simulasi login Google (dev)">
      <div className="flash flash-warn">Mode pengembangan. Di produksi, langkah ini ditangani Google.</div>
      <form action="/api/auth/google/callback" method="get">
        <input type="hidden" name="state" value={get('state') ?? ''} />
        <div className="field">
          <label htmlFor="dev_email">Akun Google</label>
          <input id="dev_email" name="dev_email" type="email" required placeholder="nama@klinik.id" />
        </div>
        <button className="btn btn-primary btn-block" type="submit">Lanjutkan</button>
      </form>
    </AuthCard>
  )
}
