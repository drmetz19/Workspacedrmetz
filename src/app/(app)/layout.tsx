import { requireUser } from '@/lib/session'
import { AppShell } from '@/components/AppShell'
import { listDivisions } from '@/server/services/org'
import { driveHealth } from '@/server/services/sources'
import { shellCounts } from '@/server/services/dashboard'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const [divisions, drive, counts] = await Promise.all([listDivisions(user), driveHealth(), shellCounts(user)])
  return (
    <AppShell user={user} divisions={divisions} counts={counts} driveConnected={drive.sources > 0 ? drive.connected : null} driveLinkMode={drive.mode === 'link'}>{children}</AppShell>
  )
}
