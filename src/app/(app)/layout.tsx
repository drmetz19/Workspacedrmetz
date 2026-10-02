import { requireUser } from '@/lib/session'
import { AppShell } from '@/components/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  return <AppShell user={user}>{children}</AppShell>
}
