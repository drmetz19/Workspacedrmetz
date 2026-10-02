import Link from 'next/link'
import { requireUser, sp, type SearchParams } from '@/lib/session'
import { getDocumentHistory, getDocumentMetadata, listDocuments, listUserOptions } from '@/server/services/documents'
import { listDocumentPermissions } from '@/server/services/permissions'
import { listDivisions } from '@/server/services/org'
import { SecurityPanel } from '@/components/SecurityPanel'
import { OpenPanel } from '@/components/OpenPanel'
import { guard } from '@/lib/page-guard'
import { Flash } from '@/components/Flash'
import { AccessDenied } from '@/components/AccessDenied'
import { ExpiryBadge, LevelBadge, StatusBadge } from '@/components/Badges'
import { fmtDate, fmtDateTime } from '@/lib/labels'
import { ACTION_LABEL, FIELD_LABEL, describePermissionChange } from '@/lib/history-labels'

export default async function DocumentDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const user = await requireUser()
  const { id } = await params
  const { get } = await sp(searchParams)
  const res = await guard(() => getDocumentMetadata(user, id))
  if (!res.ok) return <AccessDenied message={res.message} />
  const d = res.data
  const history = await getDocumentHistory(user, id)
  const manage = d.permissions.canManage
    ? { grants: await listDocumentPermissions(user, id), users: await listUserOptions(user), divisions: await listDivisions(user) }
    : null
  const replaceable = d.permissions.canEdit && d.status === 'ACTIVE' && !d.supersedes
    ? (await listDocuments(user, { status: 'ACTIVE' })).filter((x) => x.documentId !== d.documentId)
    : []

  return (
    <>
      <Flash msg={get('msg')} err={get('err')} />
      <div className="page-head">
        <div>
          <div className="row small muted" style={{ marginBottom: 6 }}>
            <Link href="/documents">Dokumen</Link> <span>/</span> <span>{d.categoryName ?? 'Tanpa kategori'}</span>
          </div>
          <h1>{d.documentName}</h1>
          <div className="row">
            <LevelBadge level={d.securityLevel} />
            <StatusBadge status={d.status} />
            <span className="badge badge-accent">Versi {d.version}</span>
            {d.flags.sourceMissing && <span className="badge badge-danger">Sumber hilang</span>}
          </div>
        </div>
        <div className="row">
          {d.permissions.canEdit && <Link className="btn" href={`/documents/${d.documentId}/edit`}>Ubah metadata</Link>}
        </div>
      </div>

      {d.status === 'DRAFT' && (
        <div className="flash flash-warn">Draft hasil scan Drive — belum bisa dicari. <Link href={`/documents/review/${d.documentId}`}>Review &amp; konfirmasi</Link></div>
      )}
      {d.status === 'SUPERSEDED' && d.supersededBy && (
        <div className="flash flash-warn">
          Dokumen ini sudah tidak berlaku. Versi aktif: <Link href={`/documents/${d.supersededBy.documentId}`}>{d.supersededBy.documentName} (v{d.supersededBy.version})</Link>
        </div>
      )}

      <OpenPanel doc={d} />

      <div className="grid grid-2">
        <div className="card">
          <h2>Metadata</h2>
          <dl className="meta">
            <dt>Nomor</dt><dd>{d.documentNumber ?? '—'}</dd>
            <dt>Kategori</dt><dd>{d.categoryName ?? '—'}</dd>
            <dt>Divisi</dt><dd>{d.divisionName ?? '—'}</dd>
            <dt>PIC</dt><dd>{d.picName ?? '—'}</dd>
            <dt>Didaftarkan oleh</dt><dd>{d.ownerName ?? '—'}</dd>
            <dt>Tanggal berlaku</dt><dd>{fmtDate(d.effectiveDate)}</dd>
            <dt>Kedaluwarsa</dt><dd><ExpiryBadge date={d.expiryDate} /></dd>
            <dt>ID dokumen</dt><dd className="mono">{d.documentId}</dd>
            {d.externalResourceId && <><dt>File Drive</dt><dd className="mono">{d.externalResourceId}</dd></>}
            {d.ownerApprovalRequired && <><dt>Persetujuan</dt><dd><span className="badge badge-warn">Wajib persetujuan Owner</span></dd></>}
          </dl>
          {d.confirmedSummary && (
            <>
              <h3 style={{ marginTop: 16 }}>Ringkasan</h3>
              <p>{d.confirmedSummary}</p>
            </>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <h2>Versi</h2>
            <ul className="list">
              {d.supersedes && (
                <li>Menggantikan: <Link href={`/documents/${d.supersedes.documentId}`}>{d.supersedes.documentName} (v{d.supersedes.version})</Link></li>
              )}
              {d.supersededBy && (
                <li>Digantikan oleh: <Link href={`/documents/${d.supersededBy.documentId}`}>{d.supersededBy.documentName} (v{d.supersededBy.version})</Link></li>
              )}
              {!d.supersedes && !d.supersededBy && <li className="muted">Belum ada versi lain.</li>}
            </ul>
            {replaceable.length > 0 && (
              <form action={`/api/documents/${d.documentId}/supersede`} method="post" className="row" style={{ marginTop: 10 }}>
                <select name="oldDocumentId" required aria-label="Dokumen lama" style={{ flex: 1, minWidth: 180 }}>
                  <option value="">Dokumen ini menggantikan…</option>
                  {replaceable.map((x) => <option key={x.documentId} value={x.documentId}>{x.documentName} (v{x.version})</option>)}
                </select>
                <button className="btn btn-sm" type="submit">Tautkan versi</button>
              </form>
            )}
          </div>
          {d.permissions.canArchive && d.status !== 'ARCHIVED' && (
            <div className="card">
              <h2>Arsip</h2>
              <p className="small muted">Dokumen keluar dari daftar aktif namun tetap tersimpan di registry dan audit.</p>
              <form action={`/api/documents/${d.documentId}/archive`} method="post">
                <button className="btn btn-danger btn-sm" type="submit">Arsipkan dokumen</button>
              </form>
            </div>
          )}
        </div>
      </div>

      {manage && <SecurityPanel doc={d} grants={manage.grants} users={manage.users} divisions={manage.divisions} />}

      <div className="card">
        <h2>Riwayat</h2>
        {history.length === 0 ? (
          <div className="empty">Belum ada riwayat.</div>
        ) : (
          <ul className="list">
            {history.map((h, i) => (
              <li key={i}>
                <div className="row">
                  <strong>{ACTION_LABEL[h.action] ?? h.action}</strong>
                  {h.result !== 'SUCCESS' && <span className="badge badge-danger">{h.result}</span>}
                  <span className="spacer" />
                  <span className="small muted">{fmtDateTime(h.occurredAt)}</span>
                </div>
                <div className="small muted">{h.actorName ?? h.actorEmail ?? 'Sistem'}</div>
                {h.action === 'PERMISSION_CHANGED' && (
                  <div className="small">{describePermissionChange(h.metadata)}</div>
                )}
                {h.action === 'DOCUMENT_UPDATED' && h.metadata.changes !== undefined && (
                  <div className="small">
                    {Object.keys(h.metadata.changes as Record<string, unknown>).map((k) => FIELD_LABEL[k] ?? k).join(', ') || 'Tidak ada perubahan'}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
