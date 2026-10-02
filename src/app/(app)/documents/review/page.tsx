import Link from 'next/link'
import { requireUser, sp, type SearchParams } from '@/lib/session'
import { listDraftsForReview } from '@/server/services/review'
import { listDriveSources } from '@/server/services/sources'
import { Flash } from '@/components/Flash'
import { LevelBadge } from '@/components/Badges'
import { Icon } from '@/components/Icon'
import { fmtDateTime } from '@/lib/labels'

export default async function ReviewQueuePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const drafts = await listDraftsForReview(user)
  const canScan = user.roleId === 'OWNER' || user.roleId === 'GM'
  const sources = canScan ? (await listDriveSources(user)).filter((s) => s.status === 'ACTIVE') : []
  return (
    <>
      <Flash msg={get('msg')} err={get('err')} />
      <div className="page-head">
        <div>
          <div className="crumbs"><Icon name="rate_review" size={14} /> Antrean review</div>
          <h1>Draft perlu review</h1>
          <p>File hasil scan Drive. Periksa saran metadata, koreksi, lalu konfirmasi agar dokumen bisa dicari.</p>
        </div>
        {sources.length > 0 && (
          <div className="row">
            {sources.map((s) => (
              <form key={s.sourceId} action={`/api/sources/${s.sourceId}/scan`} method="post">
                <input type="hidden" name="returnTo" value="/documents/review" />
                <button className="btn" type="submit"><Icon name="sync" /> Scan {s.name}</button>
              </form>
            ))}
          </div>
        )}
      </div>
      <div className="card card-flush">
        {drafts.length === 0 ? (
          <div className="empty">Tidak ada draft yang menunggu review.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th style={{ paddingLeft: 18 }}>File</th><th>Saran kategori</th><th>Level</th><th>Sumber</th><th>Masuk</th><th></th></tr></thead>
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.documentId}>
                    <td style={{ paddingLeft: 18 }}>
                      <strong>{d.documentName}</strong>
                      {d.flags.contentUnreadable && <div className="small" style={{ color: 'var(--warn-ink)' }}>Isi tidak terbaca — saran dari nama file</div>}
                    </td>
                    <td>{d.suggested.categoryName ?? <span className="muted">—</span>} {d.suggested.categoryName && <span className="badge badge-muted">saran</span>}</td>
                    <td><LevelBadge level={d.securityLevel} /></td>
                    <td className="small">{d.sourceName ?? '—'}{d.restrictedSource && <div><span className="badge badge-danger">Terbatas</span></div>}</td>
                    <td className="small">{fmtDateTime(d.createdAt)}</td>
                    <td><Link className="btn btn-sm btn-primary" href={`/documents/review/${d.documentId}`}>Review</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
