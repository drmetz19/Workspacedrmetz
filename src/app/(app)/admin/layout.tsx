import { requireUser } from '@/lib/session'
import { requireOwner } from '@/server/guards'
import { guard } from '@/lib/page-guard'
import { AccessDenied } from '@/components/AccessDenied'

/** Semua halaman /admin/* khusus Owner; percobaan akses lain diaudit. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const ok = await guard(() => requireOwner(user, 'ADMIN_PAGE_OPENED', 'ADMIN'))
  if (!ok.ok) return <AccessDenied message={ok.message} />
  return <>{children}</>
}
