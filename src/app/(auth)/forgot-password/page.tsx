import { sp, type SearchParams } from '@/lib/session'
import { AuthCard } from '@/components/AuthCard'
import { Flash } from '@/components/Flash'

export default async function ForgotPage({ searchParams }: { searchParams: SearchParams }) {
  const { get } = await sp(searchParams)
  return (
    <AuthCard title="Reset password">
      <Flash msg={get('msg')} err={get('err')} />
      <form action="/api/auth/forgot" method="post">
        <div className="field">
          <label htmlFor="email">Email terdaftar</label>
          <input id="email" name="email" type="email" required />
        </div>
        <button className="btn btn-primary btn-block" type="submit">Kirim tautan reset</button>
      </form>
      <p className="small" style={{ textAlign: 'center', marginTop: 14 }}><a href="/login">Kembali ke halaman masuk</a></p>
    </AuthCard>
  )
}
