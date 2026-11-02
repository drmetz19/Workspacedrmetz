import { requireUser } from '@/lib/session'
import { AppShell } from '@/components/AppShell'
import { listDivisions } from '@/server/services/org'
import { driveHealth } from '@/server/services/sources'
import { shellCounts } from '@/server/services/dashboard'
import { pendingOrderCount } from '@/server/services/orders'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const [divisions, drive, counts, pendingOrders] = await Promise.all([listDivisions(user), driveHealth(), shellCounts(user), pendingOrderCount(user)])
  return (
    <AppShell user={user} divisions={divisions} counts={{ ...counts, pendingOrders }} driveConnected={drive.sources > 0 ? drive.connected : null} driveLinkMode={drive.mode === 'link'}>{children}</AppShell>
  )
}
