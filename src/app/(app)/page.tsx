import Link from 'next/link'
import { requireUser, sp, type SearchParams } from '@/lib/session'
import { getCommandCenter, type ActivityItem, type DocLite } from '@/server/services/dashboard'
import { driveHealth } from '@/server/services/sources'
import { Flash } from '@/components/Flash'
import { Icon } from '@/components/Icon'
import { LevelBadge } from '@/components/Badges'
import { ACTION_LABEL } from '@/lib/history-labels'
import { fmtDate, fmtDateTime } from '@/lib/labels'
import { initials } from '@/lib/initials'

function greeting() {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jakarta' }))
  return h < 11 ? 'Selamat Pagi' : h < 15 ? 'Selamat Siang' : h < 18 ? 'Selamat Sore' : 'Selamat Malam'
}

const DIVISION_ICONS = ['gavel', 'medical_services', 'account_balance', 'storefront', 'badge', 'inventory_2']

function StatCard({ tone, eyebrow, icon, value, unit, desc, link, linkLabel, meta }: {
  tone: string; eyebrow: string; icon: string; value: number; unit: string; desc: string; link: string; linkLabel: string; meta?: string
}) {
  return (
    <div className={`card stat-card tone-${tone}`}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span className="eyebrow"><span className="dot" />{eyebrow}</span>
        <span className="spacer" />
        <span className="stat-icon"><Icon name={icon} /></span>
      </div>
      <div className="stat" style={{ color: 'var(--ink)' }}>{value} {unit}</div>
      <p className="small" style={{ color: 'var(--ink-2)', margin: 0 }}>{desc}</p>
      <div className="foot">
        <Link className="btn-link" href={link}>{linkLabel} <Icon name="arrow_forward" size={14} /></Link>
        {meta && <span className="muted">{meta}</span>}
      </div>
    </div>
  )
}

function DueLabel({ d }: { d: DocLite }) {
  if (d.daysLeft === null) return null
  if (d.daysLeft < 0) return <span style={{ color: 'var(--danger)', fontWeight: 600 }}><Icon name="hourglass_bottom" size={15} /> Lewat {-d.daysLeft} hari</span>
  if (d.daysLeft <= 30) return <span style={{ color: 'var(--danger)', fontWeight: 600 }}><Icon name="hourglass_top" size={15} /> Expiry {d.daysLeft} hari</span>
  return <span style={{ color: 'var(--warn-ink)', fontWeight: 600 }}><Icon name="event" size={15} /> Expiry {d.daysLeft} hari</span>
}

function ActivityList({ items, empty }: { items: ActivityItem[]; empty: string }) {
  if (!items.length) return <div className="empty">{empty}</div>
  return (
    <ul className="list">
      {items.map((a, i) => (
        <li key={i}>
          <div className="row" style={{ gap: 6 }}>
            <strong className="small">{ACTION_LABEL[a.action] ?? a.action}</strong>
            {a.result !== 'SUCCESS' && <span className="badge badge-danger">{a.result}</span>}
            <span className="spacer" />
            <span className="small muted">{fmtDateTime(a.occurredAt)}</span>
          </div>
          <div className="small">
            {a.documentId ? <Link href={`/documents/${a.documentId}`}>{a.documentName}</Link> : '—'}
            {a.securityLevel && a.securityLevel >= 3 ? <> · <LevelBadge level={a.securityLevel} /></> : null}
          </div>
          <div className="small muted">{a.actorName ?? a.actorEmail ?? 'Sistem'}</div>
        </li>
      ))}
    </ul>
  )
}

export default async function CommandCenterPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const [c, drive] = await Promise.all([getCommandCenter(user), driveHealth()])
  const approver = c.role !== 'DIVISION_USER'
  const urgentExpiring = c.expiring.slice(0, 6)
  const actionCount = c.pendingApprovals.length + c.draftCount

  return (
    <>
      <Flash msg={get('msg')} err={get('err')} />
      {user.roleId === 'OWNER' && drive.authErrors.length > 0 && (
        <div className="flash flash-err">
          <Icon name="cloud_off" size={16} /> Koneksi Google Drive bermasalah ({drive.authErrors.map((e) => e.name).join(', ')}): {drive.authErrors[0].error}. Scan berhenti sampai otorisasi diperbaiki — <Link href="/admin/sources">periksa Sumber Drive</Link>.
        </div>
      )}
      <div className="page-head">
        <div>
          <h1>{greeting()}, {user.name}</h1>
          <p>Pantau tata kelola dokumen, persetujuan tertunda, dan berkas per divisi.</p>
        </div>
        <div className="row">
          <Link className="btn" href="/search"><Icon name="manage_search" /> Cari dokumen</Link>
          <Link className="btn btn-primary" href="/documents/new"><Icon name="upload_file" /> Daftarkan Dokumen</Link>
        </div>
      </div>

      {approver ? (
        <div className="grid grid-3">
          <StatCard tone="danger" eyebrow="Perlu tindakan" icon="pending_actions" value={actionCount} unit="Item"
            desc={`${c.pendingApprovals.length} permintaan akses menunggu keputusan Anda dan ${c.draftCount} draft perlu direview.`}
            link={c.pendingApprovals.length ? '/access' : '/documents/review'} linkLabel="Tinjau sekarang" />
          <StatCard tone="warn" eyebrow="Akan kedaluwarsa" icon="alarm" value={c.totals.expiring + c.totals.expired} unit="Dokumen"
            desc={`Masa berlaku habis dalam ≤ 90 hari${c.totals.expired ? `, ${c.totals.expired} sudah lewat` : ''} (izin, SIP/STR, kontrak, sewa).`}
            link="/search?expiry=within90" linkLabel="Lihat daftar" meta={c.totals.expired ? `${c.totals.expired} kritis` : undefined} />
          <StatCard tone="teal" eyebrow="Google Drive" icon={drive.connected ? 'cloud_done' : 'cloud_off'} value={c.totals.activeDocuments} unit="Dokumen"
            desc={`Dokumen aktif terdaftar di CSSE; ${c.totals.driveSynced} tersinkron dari folder Drive yang terhubung.`}
            link={user.roleId === 'OWNER' ? '/admin/sources' : '/documents'} linkLabel={user.roleId === 'OWNER' ? 'Sumber Drive' : 'Direktori'}
            meta={drive.sources ? (drive.connected ? 'Terhubung' : 'Bermasalah') : 'Belum terhubung'} />
        </div>
      ) : (
        <div className="grid grid-3">
          <StatCard tone="navy" eyebrow="Permintaan akses saya" icon="verified_user" value={c.myRequests.filter((r) => r.status === 'PENDING').length} unit="Menunggu"
            desc={`${c.myRequests.filter((r) => r.status === 'APPROVED').length} akses sementara aktif.`} link="/access?tab=mine" linkLabel="Lihat permintaan" />
          <StatCard tone="warn" eyebrow="Dokumen saya akan kedaluwarsa" icon="alarm" value={c.expiring.length} unit="Dokumen"
            desc="Dokumen yang Anda tangani sebagai PIC dan habis masa berlakunya ≤ 90 hari." link="/search?expiry=within90" linkLabel="Lihat daftar" />
          <StatCard tone="danger" eyebrow="Draft ditugaskan ke saya" icon="rate_review" value={c.drafts.length} unit="Draft"
            desc="File hasil scan Drive yang perlu Anda periksa & konfirmasi." link="/documents/review" linkLabel="Review draft" />
        </div>
      )}

      {approver && c.divisions.length > 0 && (
        <>
          <div className="section-title">
            <div>
              <h2>Jelajahi Berdasarkan Divisi</h2>
              <p>Registri dokumen per divisi, dalam batas izin Anda.</p>
            </div>
            <Link className="btn-link" href="/documents">Semua direktori <Icon name="chevron_right" size={16} /></Link>
          </div>
          <div className="grid grid-3">
            {c.divisions.map((d, i) => (
              <div className="card stack" key={d.divisionId} style={{ gap: 10 }}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="stat-icon tone-navy" style={{ width: 38, height: 38, borderRadius: 4, display: 'grid', placeItems: 'center', background: 'var(--surface-3)', color: 'var(--navy-2)' }}>
                    <Icon name={DIVISION_ICONS[i % DIVISION_ICONS.length]} />
                  </span>
                  <span className="spacer" />
                  <span className="tag" style={{ fontWeight: 700 }}>{d.documentCount} Dokumen</span>
                </div>
                <h3 style={{ margin: 0 }}>Divisi {d.divisionName}</h3>
                <p className="small" style={{ color: 'var(--ink-2)', margin: 0, minHeight: 36 }}>
                  {d.topCategories.length ? d.topCategories.join(', ') : 'Belum ada dokumen terkategori.'}
                  {d.expiringCount ? ` · ${d.expiringCount} akan kedaluwarsa` : ''}
                </p>
                <div className="row small" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <span className="avatar avatar-sm">{d.managerName ? initials(d.managerName) : '—'}</span>
                  <span className="muted">Penanggung jawab:</span> <strong>{d.managerName ?? 'Belum ditentukan'}</strong>
                </div>
                <Link className="btn btn-block" href={`/search?divisionId=${d.divisionId}`}>Buka Dokumen Divisi <Icon name="arrow_forward" size={16} /></Link>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">
        <h2><span style={{ color: 'var(--danger)' }}>●</span> Dokumen Perlu Perhatian Segera</h2>
        <span className="small muted">{urgentExpiring.length + (approver ? c.pendingApprovals.length : 0)} item</span>
      </div>
      <div className="card card-flush">
        <div className="table-wrap">
          <table>
            <thead><tr><th style={{ paddingLeft: 18 }}>Nama dokumen &amp; keperluan</th><th>Divisi</th><th>Status &amp; tenggat</th><th style={{ textAlign: 'right', paddingRight: 18 }}>Aksi</th></tr></thead>
            <tbody>
              {approver && c.pendingApprovals.slice(0, 5).map((r) => (
                <tr key={r.requestId}>
                  <td style={{ paddingLeft: 18 }}>
                    <strong>{r.documentName}</strong>
                    <div className="small muted">Permintaan akses oleh {r.requesterName} · {fmtDate(r.createdAt)}</div>
                  </td>
                  <td>{r.divisionName ? <span className="tag">{r.divisionName}</span> : '—'}</td>
                  <td><span style={{ color: 'var(--warn-ink)', fontWeight: 600 }}><Icon name="rate_review" size={15} /> Menunggu persetujuan</span></td>
                  <td style={{ textAlign: 'right', paddingRight: 18 }}><Link className="btn btn-sm btn-teal" href="/access"><Icon name="task_alt" /> Review &amp; Putuskan</Link></td>
                </tr>
              ))}
              {urgentExpiring.map((d) => (
                <tr key={d.documentId}>
                  <td style={{ paddingLeft: 18 }}>
                    <strong>{d.documentName}</strong>
                    <div className="small muted">{[d.categoryName, d.picName ? `PIC ${d.picName}` : null].filter(Boolean).join(' · ') || '—'}</div>
                  </td>
                  <td>{d.divisionName ? <span className="tag">{d.divisionName}</span> : '—'}</td>
                  <td><DueLabel d={d} /></td>
                  <td style={{ textAlign: 'right', paddingRight: 18 }}><Link className="btn btn-sm" href={`/documents/${d.documentId}`}><Icon name="visibility" /> Lihat Berkas</Link></td>
                </tr>
              ))}
              {urgentExpiring.length === 0 && (!approver || c.pendingApprovals.length === 0) && (
                <tr><td colSpan={4} className="empty">Tidak ada yang mendesak. 👍</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {approver && (
        <div className="grid grid-2" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="card-head"><h2>Aktivitas Terbaru</h2><Icon name="history" /></div>
            <ActivityList items={c.recentActivity} empty="Belum ada aktivitas." />
          </div>
          <div className="card">
            <div className="card-head"><h2>Aktivitas Terbatas (L3–5)</h2><Icon name="shield_lock" /></div>
            <ActivityList items={c.restrictedActivity} empty="Belum ada akses ke dokumen terbatas." />
          </div>
        </div>
      )}

      {!approver && c.myRequests.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Permintaan akses saya</h2>
          <ul className="list">
            {c.myRequests.map((r) => (
              <li key={r.requestId} className="row">
                <Link href={`/documents/${r.documentId}`}>{r.documentName}</Link>
                <span className="spacer" />
                <span className={`badge ${r.status === 'APPROVED' ? 'badge-ok' : r.status === 'PENDING' ? 'badge-warn' : 'badge-danger'}`}>
                  {r.status === 'APPROVED' ? `Disetujui s.d. ${fmtDate(r.expiresAt)}` : r.status === 'PENDING' ? 'Menunggu' : 'Ditolak'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="ask-bar" method="get" action="/search/ask">
        <span className="ai-mark"><Icon name="psychology" /></span>
        <div style={{ flex: '1 1 260px' }}>
          <strong>Tanya Dokumen via CSSE AI Assistant</strong>
          <div className="small muted">Mis. “Cari izin operasional klinik Jakarta terbaru” atau “Dokumen apa yang akan kedaluwarsa?”</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flex: '1 1 340px' }}>
          <input name="q" placeholder="Tanyakan sesuatu pada AI…" minLength={3} required aria-label="Pertanyaan untuk AI" />
          <button className="btn btn-teal" type="submit"><Icon name="send" /> Tanya</button>
        </div>
      </form>
    </>
  )
}
