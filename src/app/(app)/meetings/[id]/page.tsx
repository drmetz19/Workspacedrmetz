import Link from 'next/link'
import { requireUser } from '@/lib/session'
import { guard } from '@/lib/page-guard'
import { getMeetingDetail } from '@/server/services/meetings'
import { listUserOptions } from '@/server/services/documents'
import { AccessDenied } from '@/components/AccessDenied'
import { Flash } from '@/components/Flash'
import { Icon } from '@/components/Icon'
import { initials } from '@/lib/initials'
import { fmtDate, fmtDateTime } from '@/lib/labels'
import { daysUntil } from '@/components/Badges'
import { toneForDivision } from '@/lib/division-colors'

const toneVar: Record<string, string> = { navy: '--navy', teal: '--accent', violet: '--violet', rose: '--rose', sky: '--sky', amber: '--amber' }

const STATUS_LABEL: Record<string, [string, string]> = {
  BELUM_MULAI: ['Belum mulai', 'badge-muted'],
  BERJALAN: ['Sedang berjalan', 'badge-warn'],
  SELESAI: ['Selesai', 'badge-ok'],
}

export default async function MeetingDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const sp = await searchParams
  const result = await guard(() => getMeetingDetail(user, id))
  if (!result.ok) return <AccessDenied message={result.message} />
  const { meeting: m, actionItems, canManage } = result.data
  const users = canManage ? await listUserOptions(user) : []
  const tone = toneForDivision(m.divisionName)

  return (
    <>
      <Flash msg={sp.msg} err={sp.err} />
      <div className="crumbs"><Link href="/meetings">Notulensi Rapat</Link> <Icon name="chevron_right" size={13} /> <span>{m.title}</span></div>
      <div className="page-head">
        <div>
          <h1 className="row" style={{ gap: 10 }}>
            {m.title}
            <span className={`badge ${m.status === 'DISAHKAN' ? 'badge-ok' : 'badge-warn'}`}>{m.status === 'DISAHKAN' ? 'Notula Disahkan' : 'Draft'}</span>
          </h1>
          <p>{fmtDate(m.meetingDate)} · {m.meetingType === 'EKSTERNAL' ? 'Rapat Eksternal' : 'Rapat Internal'} {m.divisionName ? <>· <span className={`tag tag-${tone}`}>{m.divisionName}</span></> : null}</p>
        </div>
        {m.driveUrl && <a className="btn" href={m.driveUrl} target="_blank" rel="noreferrer"><Icon name="picture_as_pdf" /> Buka Drive PDF</a>}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Ringkasan Pembahasan</h2>
          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--ink-2)' }}>{m.summary}</p>
        </div>
        <div className="card">
          <h2>Peserta Rapat</h2>
          {m.attendees.length === 0 ? <div className="empty">Belum ada peserta dicatat.</div> : (
            <ul className="list">
              {m.attendees.map((a, i) => (
                <li key={i} className="row" style={{ gap: 8 }}><span className="avatar avatar-sm">{initials(a)}</span>{a}</li>
              ))}
            </ul>
          )}
          <dl className="meta" style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <dt>Penanggung jawab</dt><dd>{m.picName ?? 'Belum ditentukan'}</dd>
            <dt>Dicatat oleh</dt><dd>{m.createdByName ?? '—'}</dd>
            <dt>Dibuat</dt><dd>{fmtDateTime(m.createdAt)}</dd>
          </dl>
        </div>
      </div>

      <div className="section-title" id="tindak-lanjut">
        <div>
          <h2>Butir Tindak Lanjut</h2>
          <p>{actionItems.length} tugas tercatat dari rapat ini.</p>
        </div>
      </div>
      <div className="card card-flush">
        {actionItems.length === 0 ? (
          <div className="empty">Belum ada tindak lanjut.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th style={{ paddingLeft: 18 }}>Deskripsi</th><th>PIC</th><th>Tenggat</th><th>Status</th>{canManage && <th style={{ textAlign: 'right', paddingRight: 18 }}>Aksi</th>}</tr></thead>
              <tbody>
                {actionItems.map((a) => {
                  const [label, cls] = STATUS_LABEL[a.status]
                  const days = daysUntil(a.dueDate)
                  const overdue = days !== null && days < 0 && a.status !== 'SELESAI'
                  return (
                    <tr key={a.actionItemId}>
                      <td style={{ paddingLeft: 18 }}>{a.description}</td>
                      <td>{a.picName ?? <span className="muted">Belum ditentukan</span>}</td>
                      <td>{a.dueDate ? (overdue ? <span className="badge badge-danger">Lewat {-days!} hari</span> : fmtDate(a.dueDate)) : <span className="muted">—</span>}</td>
                      <td><span className={`badge ${cls}`}>{label}</span></td>
                      {canManage && (
                        <td style={{ textAlign: 'right', paddingRight: 18 }}>
                          <form action={`/api/action-items/${a.actionItemId}/status`} method="post" className="row" style={{ justifyContent: 'flex-end' }}>
                            <select name="status" defaultValue={a.status} style={{ minHeight: 30, fontSize: 12, width: 'auto' }} aria-label="Ubah status">
                              <option value="BELUM_MULAI">Belum mulai</option>
                              <option value="BERJALAN">Berjalan</option>
                              <option value="SELESAI">Selesai</option>
                            </select>
                            <button className="btn btn-sm" type="submit">Simpan</button>
                          </form>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canManage && (
        <div className="card">
          <h2>Tambah Tindak Lanjut</h2>
          <form action="/api/action-items" method="post" className="form-grid">
            <input type="hidden" name="minutesId" value={m.minutesId} />
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="description">Deskripsi tugas</label>
              <input id="description" name="description" required minLength={3} placeholder="mis. Siapkan draft perpanjangan SIP ke notaris" />
            </div>
            <div className="field">
              <label htmlFor="picUserId">PIC</label>
              <select id="picUserId" name="picUserId" defaultValue="">
                <option value="">— Belum ditentukan —</option>
                {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="dueDate">Tenggat</label>
              <input id="dueDate" name="dueDate" type="date" />
            </div>
            <div className="field" style={{ alignSelf: 'end' }}>
              <button className="btn btn-primary btn-block" type="submit"><Icon name="add_task" /> Tambah</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
