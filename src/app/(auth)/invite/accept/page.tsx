import { sp, type SearchParams } from '@/lib/session'
import { AuthCard } from '@/components/AuthCard'
import { Flash } from '@/components/Flash'
import { SetPasswordForm } from '@/components/SetPasswordForm'

export default async function InviteAcceptPage({ searchParams }: { searchParams: SearchParams }) {
  const { get } = await sp(searchParams)
  return (
    <AuthCard title="Terima undangan">
      <Flash err={get('err')} />
      <p className="small muted">Buat password untuk akun Anda. Anda juga bisa langsung <a href="/login">masuk dengan Google</a> memakai email yang diundang.</p>
      <SetPasswordForm token={get('token') ?? ''} />
    </AuthCard>
  )
}
