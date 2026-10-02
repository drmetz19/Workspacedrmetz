import { requireUser } from '@/lib/session'
import { AppShell } from '@/components/AppShell'
import { listDivisions } from '@/server/services/org'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const divisions = await listDivisions(user)
  return (
    <AppShell user={user} divisions={divisions}>{children}</AppShell>
  )
}
