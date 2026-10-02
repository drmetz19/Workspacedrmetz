import { redirect } from 'next/navigation'
import { currentUser, sp, type SearchParams } from '@/lib/session'
import { AuthCard } from '@/components/AuthCard'
import { Flash } from '@/components/Flash'

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  if (await currentUser()) redirect('/')
  const { get } = await sp(searchParams)
  return (
    <AuthCard title="Masuk">
      <Flash msg={get('msg')} err={get('err')} />
      <a className="btn btn-primary btn-block" href="/api/auth/google/start">Masuk dengan Google</a>
      <p className="field-hint" style={{ textAlign: 'center' }}>Google Workspace klinik atau Gmail pribadi yang diundang. Owner &amp; GM wajib lewat Google.</p>
      <div className="divider">atau dengan password</div>
      <form action="/api/auth/password" method="post">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <button className="btn btn-block" type="submit">Masuk</button>
      </form>
      <p className="small" style={{ textAlign: 'center', marginTop: 14 }}>
        <a href="/forgot-password">Lupa password?</a>
      </p>
      <p className="field-hint" style={{ textAlign: 'center' }}>Akses hanya untuk email yang sudah diundang.</p>
    </AuthCard>
  )
}
