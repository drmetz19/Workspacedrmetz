import type { IdentityContext } from '@/server/context'
import { ROLE_LABEL } from '@/lib/labels'
import { NavLink } from './NavLink'

export function AppShell({ user, children }: { user: IdentityContext; children: React.ReactNode }) {
  const owner = user.roleId === 'OWNER'
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">Dr. Metz Workspace</div>
          <div className="brand-sub">CSSE · Dokumen</div>
        </div>
        <nav className="nav-group" aria-label="Utama">
          <span className="nav-label">Kerja</span>
          <NavLink href="/" exact>Command Center</NavLink>
        </nav>
        {owner && (
          <nav className="nav-group" aria-label="Administrasi">
            <span className="nav-label">Administrasi</span>
            <NavLink href="/admin/users">User &amp; Undangan</NavLink>
          </nav>
        )}
        <div className="sidebar-foot">
          <div className="who">{user.name}</div>
          <div className="role">{ROLE_LABEL[user.roleId]} · {user.email}</div>
          <form action="/api/auth/logout" method="post">
            <button className="btn btn-sm" type="submit">Keluar</button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
