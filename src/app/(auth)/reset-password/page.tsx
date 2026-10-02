import { sp, type SearchParams } from '@/lib/session'
import { AuthCard } from '@/components/AuthCard'
import { Flash } from '@/components/Flash'
import { SetPasswordForm } from '@/components/SetPasswordForm'

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const { get } = await sp(searchParams)
  return (
    <AuthCard title="Password baru">
      <Flash err={get('err')} />
      <SetPasswordForm token={get('token') ?? ''} />
    </AuthCard>
  )
}
