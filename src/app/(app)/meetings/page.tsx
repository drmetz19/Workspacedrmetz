import Link from 'next/link'
import { requireUser, sp, type SearchParams } from '@/lib/session'
import { listDivisions } from '@/server/services/org'
import { listUserOptions } from '@/server/services/documents'
import { listMeetings, listActionItems, getMeetingStats, type ActionItemDto } from '@/server/services/meetings'
import { Flash } from '@/components/Flash'
import { Icon } from '@/components/Icon'
import { initials } from '@/lib/initials'
import { fmtDate } from '@/lib/labels'
import { daysUntil } from '@/components/Badges'
import { toneForDivision } from '@/lib/division-colors'

const toneVar: Record<string, string> = { navy: '--navy', teal: '--accent', violet: '--violet', rose: '--rose', sky: '--sky', amber: '--amber' }

const STATUS_OPTIONS = [
  { key: 'OPEN', label: 'Belum selesai' },
  { key: 'ALL', label: 'Semua status' },
  { key: 'BELUM_MULAI', label: 'Belum mulai' },
  { key: 'BERJALAN', label: 'Sedang berjalan' },
  { key: 'SELESAI', label: 'Selesai' },
] as const

function TodoItem({ item }: { item: ActionItemDto }) {
  const done = item.status === 'SELESAI'
  const days = daysUntil(item.dueDate)
  return (
    <div className={`todo-item${done ? ' done' : ''}`}>
      <form action={`/api/action-items/${item.actionItemId}/status`} method="post">
        <input type="hidden" name="status" value={done ? 'BELUM_MULAI' : 'SELESAI'} />
        <button type="submit" className="todo-check" title={done ? 'Tandai belum selesai' : 'Tandai selesai'}>
          <Icon name="check" size={13} />
        </button>
      </form>
      <div className="todo-body">
        <div className="todo-desc">{item.description}</div>
        <div className="todo-tags">
          {item.divisionName && <span className={`tag tag-${toneForDivision(item.divisionName)}`}>{item.divisionName}</span>}
          {item.picName && <span className="small muted">{item.picName}</span>}
          {item.dueDate && (
            <span className={`small ${days !== null && days < 0 && !done ? 'badge badge-danger' : ''}`} style={{ color: days !== null && days < 0 && !done ? undefined : 'var(--ink-3)' }}>
              {days !== null && days < 0 && !done ? `Lewat ${-days} hari` : `Tenggat ${fmtDate(item.dueDate)}`}
            </span>
          )}
          {!done && item.status === 'BERJALAN' && <span className="badge badge-warn">Berjalan</span>}
          {done && <span className="badge badge-ok">Selesai</span>}
        </div>
      </div>
    </div>
  )
}

export default async function MeetingsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const divisionId = get('division') || undefined
  const statusKey = (STATUS_OPTIONS.find((s) => s.key === get('status'))?.key ?? 'OPEN') as (typeof STATUS_OPTIONS)[number]['key']

  const [divisions, meetings, todos, stats, users] = await Promise.all([
    listDivisions(user),
    listMeetings(user, { divisionId }),
    listActionItems(user, { divisionId, status: statusKey === 'ALL' ? undefined : statusKey, limit: 60 }),
    getMeetingStats(user),
    listUserOptions(user),
  ])
  const visibleDivisions = user.roleId === 'DIVISION_USER' ? divisions.filter((d) => d.divisionId === user.divisionId) : divisions

  const tabHref = (over: Record<string, string | null>) => {
    const p = new URLSearchParams()
    const cur: Record<string, string | null> = { division: divisionId ?? null, status: statusKey === 'OPEN' ? null : statusKey, ...over }
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v)
    const s = p.toString()
    return `/meetings${s ? `?${s}` : ''}`
  }

  return (
    <>
      <Flash msg={get('msg')} err={get('err')} />
      <div className="page-head">
        <div>
          <h1>Notulensi Rapat &amp; Tindak Lanjut</h1>
          <p>Dokumentasi hasil rapat divisi, penugasan to-do, dan pemantauan tindak lanjut hingga tuntas.</p>
        </div>
        <div className="row">
          <Link className="btn" href="/meetings?status=ALL"><Icon name="filter_list" /> Rapat Terbaru</Link>
          <Link className="btn btn-primary" href="/meetings/new"><Icon name="add" /> Buat Notulensi Baru</Link>
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card stat-card tone-rose">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <span className="eyebrow"><span className="dot" />Tindak Lanjut Aktif</span>
            <span className="spacer" />
            <span className="stat-icon"><Icon name="task_alt" /></span>
          </div>
          <div className="stat">{stats.activeActionItems}</div>
          <p className="small" style={{ margin: 0 }}>{stats.dueThisWeek > 0 ? `${stats.dueThisWeek} tenggat dalam 7 hari ke depan.` : 'Tidak ada tenggat mendesak minggu ini.'}</p>
        </div>
        <div className="card stat-card tone-sky">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <span className="eyebrow"><span className="dot" />Dokumentasi Rapat Bulan Ini</span>
            <span className="spacer" />
            <span className="stat-icon"><Icon name="event_note" /></span>
          </div>
          <div className="stat">{stats.minutesThisMonth}</div>
          <p className="small" style={{ margin: 0 }}>Notulensi tercatat di divisi yang bisa Anda lihat.</p>
        </div>
        <div className="card stat-card tone-amber">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <span className="eyebrow"><span className="dot" />Kinerja Kepatuhan</span>
            <span className="spacer" />
            <span className="stat-icon"><Icon name="verified" /></span>
          </div>
          <div className="stat">{stats.complianceRate}%</div>
          <p className="small" style={{ margin: 0 }}>Tindak lanjut bertenggat yang diselesaikan tepat waktu.</p>
        </div>
      </div>

      <nav className="seg" aria-label="Divisi" style={{ marginTop: 20 }}>
        <Link href={tabHref({ division: null })} className={`seg-item${!divisionId ? ' active' : ''}`} style={!divisionId ? { background: 'var(--navy)', borderColor: 'var(--navy)' } : undefined}>
          Semua Rapat <span className="count">{meetings.length}</span>
        </Link>
        {visibleDivisions.map((d) => {
          const tone = toneForDivision(d.divisionName)
          const active = divisionId === d.divisionId
          return (
            <Link key={d.divisionId} href={tabHref({ division: d.divisionId })} className={`seg-item${active ? ' active' : ''}`}
              style={active ? { background: `var(${toneVar[tone]})`, borderColor: `var(${toneVar[tone]})` } : undefined}>
              {d.divisionName}
            </Link>
          )
        })}
      </nav>

      <div className="meet-grid" style={{ marginTop: 16 }}>
        <div className="meet-list">
          <div className="section-title" style={{ marginTop: 0 }}>
            <h2>Daftar Notulensi Rapat Terbaru</h2>
          </div>
          {meetings.length === 0 && <div className="card empty">Belum ada notulensi rapat {divisionId ? 'untuk divisi ini' : ''}.</div>}
          {meetings.map((m) => {
            const tone = toneForDivision(m.divisionName)
            return (
              <div key={m.minutesId} className="meet-card" style={{ borderLeftColor: `var(${toneVar[tone]})` }}>
                <div className="meet-card-body">
                  <div className="meet-card-head">
                    {m.divisionName && <span className={`tag tag-${tone}`}>{m.divisionName}</span>}
                    <span className={`badge ${m.status === 'DISAHKAN' ? 'badge-ok' : 'badge-warn'}`}>{m.status === 'DISAHKAN' ? 'Notula Disahkan' : 'Draft'}</span>
                    <span className="badge badge-muted">{m.meetingType === 'EKSTERNAL' ? 'Eksternal' : 'Internal'}</span>
                    <span className="spacer" />
                    <span className="small muted">{fmtDate(m.meetingDate)}</span>
                  </div>
                  <Link href={`/meetings/${m.minutesId}`} className="meet-card-title" style={{ color: 'var(--ink)' }}>{m.title}</Link>
                  <div className="meet-meta">
                    {m.attendees.length > 0 && (
                      <span className="row" style={{ gap: 6 }}>
                        <span className="avatar-stack">
                          {m.attendees.slice(0, 4).map((a, i) => <span key={i} className="avatar avatar-sm" title={a}>{initials(a)}</span>)}
                        </span>
                        {m.attendees.length} peserta rapat
                      </span>
                    )}
                    {m.picName && <span>· PIC {m.picName}</span>}
                  </div>
                  <p className="meet-summary">{m.summary.length > 220 ? `${m.summary.slice(0, 220)}…` : m.summary}</p>
                  <div className="meet-foot">
                    <Link href={`/meetings/${m.minutesId}#tindak-lanjut`}><Icon name="checklist" size={15} /> {m.actionItemCount} Butir Tindak Lanjut{m.openActionItemCount ? ` (${m.openActionItemCount} belum selesai)` : ''}</Link>
                    {m.driveUrl && <a href={m.driveUrl} target="_blank" rel="noreferrer"><Icon name="picture_as_pdf" size={15} /> Drive PDF</a>}
                    <span className="spacer" />
                    <Link href={`/meetings/${m.minutesId}`} className="btn-link">Lihat Notulensi Lengkap <Icon name="arrow_forward" size={14} /></Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <aside className="todo-panel">
          <div className="card">
            <div className="card-head">
              <h2>To-Do List &amp; Action Items</h2>
            </div>
            <form className="row" method="get" action="/meetings" style={{ marginBottom: 10 }}>
              {divisionId && <input type="hidden" name="division" value={divisionId} />}
              <select name="status" defaultValue={statusKey} style={{ fontSize: 12 }}>
                {STATUS_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <button className="btn btn-sm" type="submit">Terapkan</button>
              <span className="spacer" />
              <span className="small muted">{todos.length} Tugas</span>
            </form>
            {todos.length === 0 ? <div className="empty">Tidak ada tindak lanjut untuk filter ini.</div> : todos.map((t) => <TodoItem key={t.actionItemId} item={t} />)}
            <form className="todo-add" action="/api/action-items" method="post">
              {divisionId ? <input type="hidden" name="divisionId" value={divisionId} /> : <input type="hidden" name="divisionId" value={user.divisionId ?? visibleDivisions[0]?.divisionId ?? ''} />}
              <input name="description" placeholder="+ Tambahkan tindak lanjut baru…" required minLength={3} style={{ fontSize: 12.5 }} />
              <button className="btn btn-sm btn-primary" type="submit">Simpan</button>
            </form>
          </div>
          <div className="card small muted">
            <strong style={{ color: 'var(--ink)' }}>PIC cepat</strong>
            <p style={{ margin: '4px 0 0' }}>Gunakan halaman detail notulensi untuk menugaskan PIC &amp; tenggat pada tindak lanjut baru. Daftar user: {users.length} orang aktif.</p>
          </div>
        </aside>
      </div>
    </>
  )
}
