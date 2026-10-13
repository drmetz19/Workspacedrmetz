import { redirect } from 'next/navigation'
import { currentUser, sp, type SearchParams } from '@/lib/session'
import { AuthCard } from '@/components/AuthCard'
import { Flash } from '@/components/Flash'

export default async function ChangePasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  if (!user.mustChangePassword) redirect('/')
  const { get } = await sp(searchParams)
  return (
    <AuthCard title="Buat password baru">
      <Flash err={get('err')} />
      <p className="small muted">
        Halo {user.name}, Anda masuk dengan password default divisi. Buat password baru yang hanya Anda ketahui — password ini dipakai untuk masuk berikutnya.
      </p>
      <form action="/api/auth/change-password" method="post">
        <div className="field">
          <label htmlFor="password">Password baru</label>
          <input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required />
          <div className="field-hint">Minimal 8 karakter, bukan pola password default.</div>
        </div>
        <div className="field">
          <label htmlFor="confirm">Ulangi password</label>
          <input id="confirm" name="confirm" type="password" minLength={8} autoComplete="new-password" required />
        </div>
        <button className="btn btn-primary btn-block" type="submit">Simpan &amp; lanjut</button>
      </form>
      <form action="/api/auth/logout" method="post" style={{ textAlign: 'center', marginTop: 12 }}>
        <button className="btn btn-sm" type="submit">Keluar</button>
      </form>
    </AuthCard>
  )
}
