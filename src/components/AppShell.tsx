import { Suspense } from 'react'
import type { IdentityContext } from '@/server/context'
import { ROLE_LABEL } from '@/lib/labels'
import { initials } from '@/lib/initials'
import { NavLink } from './NavLink'
import { Icon } from './Icon'

export interface ShellCounts {
  pendingApprovals?: number
  draftsToReview?: number
}

export interface ShellDivision {
  divisionId: string
  divisionName: string
}

export function AppShell({ user, children, counts = {}, divisions = [], driveConnected = null }: {
  user: IdentityContext
  children: React.ReactNode
  counts?: ShellCounts
  divisions?: ShellDivision[]
  driveConnected?: boolean | null
}) {
  const owner = user.roleId === 'OWNER'
  return (
    <div className="shell">
      <header className="topbar">
        <a href="/" className="brand" style={{ textDecoration: 'none' }}>
          <span className="brand-logo"><Icon name="clinical_notes" size={19} /></span>
          <span>
            <div className="brand-mark">Dr. Metz Workspace</div>
            <div className="brand-sub">CSSE Governance Command Center</div>
          </span>
        </a>
        <form className="top-search" action="/search" method="get" role="search">
          <Icon name="search" />
          <input name="q" placeholder="Cari nama dokumen, nomor, atau PIC…" aria-label="Cari dokumen" />
        </form>
        <div className="top-right">
          {driveConnected !== null && (
            <span className={`chip-status${driveConnected ? '' : ' off'}`} title="Status koneksi Google Drive">
              <span className="dot" /> <Icon name={driveConnected ? 'cloud_done' : 'cloud_off'} size={15} /> {driveConnected ? 'Drive Terhubung' : 'Drive Belum Terhubung'}
            </span>
          )}
          <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
          <div className="who-block">
            <div className="who">{user.name}</div>
            <div className="role">{ROLE_LABEL[user.roleId]}</div>
          </div>
        </div>
      </header>
      <aside className="sidebar">
        <Suspense>
        <nav className="nav-group" aria-label="Utama">
          <span className="nav-label">Menu utama</span>
          <NavLink href="/" exact icon="dashboard">Beranda / Overview</NavLink>
          <NavLink href="/documents" icon="folder">Direktori Dokumen</NavLink>
          <NavLink href="/search" icon="manage_search">Pencarian</NavLink>
        </nav>
        {divisions.length > 0 && (
          <nav className="nav-group" aria-label="Divisi">
            <span className="nav-label">Divisi klinik &amp; bisnis</span>
            {divisions.map((d) => (
              <NavLink key={d.divisionId} href={`/search?divisionId=${d.divisionId}`} icon="account_tree" matchQuery>{d.divisionName}</NavLink>
            ))}
          </nav>
        )}
        {owner && (
          <nav className="nav-group" aria-label="Administrasi">
            <span className="nav-label">Administrasi</span>
            <NavLink href="/admin/users" icon="badge">User &amp; Undangan</NavLink>
            <NavLink href="/admin/divisions" icon="account_tree">Divisi</NavLink>
            <NavLink href="/admin/categories" icon="sell">Kategori</NavLink>
          </nav>
        )}
        </Suspense>
        <div className="sidebar-foot">
          <form action="/api/auth/logout" method="post">
            <button className="btn btn-sm btn-block" type="submit"><Icon name="logout" /> Keluar</button>
          </form>
        </div>
      </aside>
      <main className="main">
        {children}
        <footer className="footer">
          <span>© 2026 Dr. Metz Ecosystem · CSSE Document Governance</span>
          <span>{user.email}</span>
        </footer>
      </main>
    </div>
  )
}
