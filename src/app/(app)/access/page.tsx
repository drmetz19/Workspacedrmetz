import Link from 'next/link'
import { requireUser, sp, type SearchParams } from '@/lib/session'
import { listDecidedRequests, listMyRequests, listPendingApprovals, type AccessRequestDto } from '@/server/services/access'
import { Flash } from '@/components/Flash'
import { LevelBadge } from '@/components/Badges'
import { Icon } from '@/components/Icon'
import { fmtDateTime } from '@/lib/labels'
import { initials } from '@/lib/initials'

const STATUS: Record<string, [string, string]> = {
  PENDING: ['Menunggu', 'badge-warn'],
  APPROVED: ['Disetujui', 'badge-ok'],
  REJECTED: ['Ditolak', 'badge-danger'],
  EXPIRED: ['Berakhir', 'badge-muted'],
  CANCELLED: ['Dibatalkan', 'badge-muted'],
}
const ACTION = { OPEN: 'Buka dokumen', EDIT_METADATA: 'Ubah metadata' }

function RequestCard({ r, decide, mine }: { r: AccessRequestDto; decide?: boolean; mine?: boolean }) {
  const [label, cls] = STATUS[r.status]
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 8 }}>
        <span className={`badge ${cls}`}>{label}</span>
        <LevelBadge level={r.securityLevel} />
        <span className="tag">{ACTION[r.requestedAction]}</span>
        {r.autoCreated && <span className="badge badge-accent">Otomatis</span>}
        <span className="spacer" />
        <span className="small muted">{fmtDateTime(r.createdAt)}</span>
      </div>
      <h3 style={{ marginBottom: 4 }}><Link href={`/documents/${r.documentId}`}>{r.documentName}</Link></h3>
      <div className="small muted" style={{ marginBottom: 10 }}>{[r.categoryName, r.divisionName].filter(Boolean).join(' · ') || '—'}</div>
      {!mine && (
        <div className="row small" style={{ marginBottom: 8 }}>
          <span className="avatar avatar-sm">{initials(r.requesterName)}</span> Diajukan oleh <strong>{r.requesterName}</strong> <span className="muted">{r.requesterEmail}</span>
        </div>
      )}
      <p style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 4, padding: '8px 12px' }}>“{r.reason}”</p>
      <div className="small muted">Diputuskan oleh: {r.approverRole === 'OWNER' ? 'Owner' : 'GM atau Owner'}</div>
      {r.status === 'APPROVED' && <div className="small">Disetujui {r.decidedByName ?? ''} · {r.durationDays} hari · berlaku s.d. <strong>{fmtDateTime(r.expiresAt)}</strong></div>}
      {(r.status === 'REJECTED') && <div className="small" style={{ color: 'var(--danger-ink)' }}>Ditolak {r.decidedByName ?? ''}: {r.decisionNote}</div>}
      {decide && r.status === 'PENDING' && (
        <div className="grid grid-2" style={{ marginTop: 12 }}>
          <form action={`/api/access-requests/${r.requestId}/approve`} method="post" className="row">
            <select name="durationDays" defaultValue="1" aria-label="Durasi akses" style={{ width: 'auto' }}>
              <option value="1">1 hari</option>
              <option value="7">7 hari</option>
              <option value="30">30 hari</option>
            </select>
            <button className="btn btn-teal" type="submit"><Icon name="task_alt" /> Setujui</button>
          </form>
          <form action={`/api/access-requests/${r.requestId}/reject`} method="post" className="row">
            <input name="note" required minLength={3} placeholder="Alasan penolakan" style={{ flex: 1, minWidth: 140 }} />
            <button className="btn btn-danger" type="submit">Tolak</button>
          </form>
        </div>
      )}
      {mine && r.status === 'PENDING' && (
        <form action={`/api/access-requests/${r.requestId}/cancel`} method="post" style={{ marginTop: 10 }}>
          <button className="btn btn-sm" type="submit">Batalkan permintaan</button>
        </form>
      )}
    </div>
  )
}

export default async function AccessPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const approver = user.roleId !== 'DIVISION_USER'
  const [pending, mine, decided] = await Promise.all([listPendingApprovals(user), listMyRequests(user), listDecidedRequests(user)])
  const tab = get('tab') ?? (approver ? 'pending' : 'mine')
  const list = tab === 'mine' ? mine : tab === 'decided' ? decided : pending
  const activeGrants = decided.filter((r) => r.status === 'APPROVED').length

  return (
    <>
      <Flash msg={get('msg')} err={get('err')} />
      <div className="page-head">
        <div>
          <div className="crumbs"><Icon name="verified_user" size={14} /> Otorisasi dokumen</div>
          <h1>Persetujuan Akses</h1>
          <p>Permintaan membuka dokumen Level 3–5. Akses yang disetujui bersifat sementara dan berakhir otomatis.</p>
        </div>
      </div>
      <div className="tabs">
        {approver && <Link href="/access?tab=pending" className={`tab${tab === 'pending' ? ' active' : ''}`}>Menunggu Tindakan Saya <span className="count">{pending.length}</span></Link>}
        <Link href="/access?tab=mine" className={`tab${tab === 'mine' ? ' active' : ''}`}>Permintaan Saya <span className="count">{mine.filter((m) => m.status === 'PENDING').length}</span></Link>
        {approver && <Link href="/access?tab=decided" className={`tab${tab === 'decided' ? ' active' : ''}`}>Riwayat Keputusan</Link>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }} className="access-grid">
        <div className="stack">
          {list.length === 0 && <div className="card empty">{tab === 'pending' ? 'Tidak ada permintaan yang menunggu Anda.' : 'Belum ada permintaan.'}</div>}
          {list.map((r) => <RequestCard key={r.requestId} r={r} decide={tab === 'pending'} mine={tab === 'mine'} />)}
        </div>
        <aside className="stack">
          <div className="card">
            <h3>Ringkasan otorisasi</h3>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><div className="stat" style={{ fontSize: 24 }}>{pending.length}</div><div className="small muted">Menunggu Anda</div></div>
              <div><div className="stat" style={{ fontSize: 24 }}>{approver ? activeGrants : mine.filter((m) => m.status === 'APPROVED').length}</div><div className="small muted">Akses aktif</div></div>
            </div>
          </div>
          <div className="card small">
            <h3>Aturan</h3>
            <ul className="list">
              <li>L3 → diputuskan GM atau Owner</li>
              <li>L4–L5 & dokumen bertanda wajib persetujuan → Owner</li>
              <li>Durasi akses 1, 7, atau 30 hari</li>
              <li>Semua keputusan tercatat di audit</li>
            </ul>
          </div>
        </aside>
      </div>
    </>
  )
}
