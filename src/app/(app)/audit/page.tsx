import Link from 'next/link'
import { requireUser, sp, type SearchParams } from '@/lib/session'
import { getAuditHistory, listAuditActions } from '@/server/services/audit-log'
import { listUserOptions } from '@/server/services/documents'
import { guard } from '@/lib/page-guard'
import { Flash } from '@/components/Flash'
import { AccessDenied } from '@/components/AccessDenied'
import { Icon } from '@/components/Icon'
import { ACTION_LABEL } from '@/lib/history-labels'
import { fmtDateTime } from '@/lib/labels'

const RESULT_BADGE: Record<string, string> = { SUCCESS: 'badge-ok', DENIED: 'badge-danger', FAILED: 'badge-danger', REJECTED: 'badge-warn' }

function summarize(meta: Record<string, unknown>) {
  const keys = ['reason', 'method', 'attempted', 'kind', 'question', 'via', 'note', 'error', 'durationDays']
  return keys.filter((k) => meta[k] !== undefined && meta[k] !== null && meta[k] !== '').map((k) => `${k}: ${String(meta[k])}`).join(' · ')
}

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { raw, get } = await sp(searchParams)
  const filters = {
    actorUserId: get('actorUserId'), action: get('action'), result: get('result'), documentId: get('documentId'),
    q: get('q'), from: get('from'), to: get('to'), before: get('before'),
  }
  const res = await guard(() => getAuditHistory(user, filters))
  if (!res.ok) return <AccessDenied message={res.ok === false && res.code === 'ACCESS_DENIED' ? 'Log audit hanya dapat dilihat Owner.' : res.message} />
  const [actions, users] = await Promise.all([listAuditActions(user), listUserOptions(user)])
  const qs = new URLSearchParams(Object.entries(raw).filter(([k, v]) => typeof v === 'string' && v && k !== 'before') as [string, string][])
  const csvQs = new URLSearchParams(qs)
  csvQs.set('format', 'csv')

  return (
    <>
      <Flash err={get('err')} />
      <div className="page-head">
        <div>
          <div className="crumbs"><Icon name="policy" size={14} /> Compliance audit</div>
          <h1>Log Audit</h1>
          <p>Siapa melakukan apa, kapan, dengan akun apa, pada resource mana, dan hasilnya. Log bersifat append-only.</p>
        </div>
        <a className="btn" href={`/api/audit?${csvQs}`}><Icon name="download" /> Ekspor CSV</a>
      </div>
      <form className="card" method="get" action="/audit">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="actorUserId">User</label>
            <select id="actorUserId" name="actorUserId" defaultValue={filters.actorUserId ?? ''}>
              <option value="">Semua</option>
              {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="action">Aksi</label>
            <select id="action" name="action" defaultValue={filters.action ?? ''}>
              <option value="">Semua</option>
              {actions.map((a) => <option key={a} value={a}>{ACTION_LABEL[a] ?? a} ({a})</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="result">Hasil</label>
            <select id="result" name="result" defaultValue={filters.result ?? ''}>
              <option value="">Semua</option>
              <option value="SUCCESS">Berhasil</option>
              <option value="DENIED">Ditolak (izin)</option>
              <option value="REJECTED">Ditolak (login)</option>
              <option value="FAILED">Gagal</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="q">Dokumen / email</label>
            <input id="q" name="q" defaultValue={filters.q ?? ''} placeholder="Nama dokumen atau email" />
          </div>
          <div className="field">
            <label htmlFor="from">Dari tanggal</label>
            <input id="from" name="from" type="date" defaultValue={filters.from ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="to">Sampai tanggal</label>
            <input id="to" name="to" type="date" defaultValue={filters.to ?? ''} />
          </div>
        </div>
        {filters.documentId && <input type="hidden" name="documentId" value={filters.documentId} />}
        <div className="row">
          <button className="btn btn-primary" type="submit"><Icon name="filter_alt" /> Terapkan filter</button>
          <Link className="btn" href="/audit">Reset</Link>
        </div>
      </form>

      <div className="card card-flush" style={{ marginTop: 16 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th style={{ paddingLeft: 18 }}>Waktu (WIB)</th><th>Siapa</th><th>Aksi</th><th>Resource</th><th>Hasil</th><th>Detail</th></tr></thead>
            <tbody>
              {res.data.events.length === 0 && <tr><td colSpan={6} className="empty">Tidak ada event untuk filter ini.</td></tr>}
              {res.data.events.map((e) => (
                <tr key={e.eventId}>
                  <td style={{ paddingLeft: 18, whiteSpace: 'nowrap' }} className="small">{fmtDateTime(e.occurredAt)}</td>
                  <td className="small"><strong>{e.actorName ?? (e.source === 'SYSTEM' ? 'Sistem' : '—')}</strong><div className="muted mono">{e.actorEmail ?? ''}</div></td>
                  <td className="small">{ACTION_LABEL[e.action] ?? e.action}<div className="muted mono">{e.action}</div></td>
                  <td className="small">
                    {e.resourceType === 'DOCUMENT' && e.resourceId ? <Link href={`/documents/${e.resourceId}`}>{e.resourceLabel ?? e.resourceId}</Link> : (e.resourceLabel ?? e.resourceType ?? '—')}
                    <div className="muted">{e.resourceType ?? ''}</div>
                  </td>
                  <td><span className={`badge ${RESULT_BADGE[e.result] ?? 'badge-muted'}`}>{e.result}</span></td>
                  <td className="small muted" style={{ maxWidth: 280 }}>{summarize(e.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {res.data.nextBefore && (
        <div className="row" style={{ marginTop: 12 }}>
          <Link className="btn" href={`/audit?${new URLSearchParams({ ...Object.fromEntries(qs), before: res.data.nextBefore })}`}>Muat event lebih lama <Icon name="chevron_right" size={16} /></Link>
        </div>
      )}
    </>
  )
}
