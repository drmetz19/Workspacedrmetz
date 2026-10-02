import { requireUser, sp, type SearchParams } from '@/lib/session'
import { listDriveSources } from '@/server/services/sources'
import { listDivisions } from '@/server/services/org'
import { driveAdapter } from '@/server/integrations/drive'
import { Flash } from '@/components/Flash'
import { Icon } from '@/components/Icon'
import { fmtDateTime } from '@/lib/labels'

export default async function SourcesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const [sources, divisions] = await Promise.all([listDriveSources(user), listDivisions(user)])
  const adapter = driveAdapter()
  return (
    <>
      <Flash msg={get('msg')} err={get('err')} />
      <div className="page-head">
        <div>
          <div className="crumbs"><Icon name="cloud_sync" size={14} /> Integrasi</div>
          <h1>Sumber Google Drive</h1>
          <p>Folder yang dipindai CSSE. File baru menjadi draft yang harus dikonfirmasi sebelum bisa dicari.</p>
        </div>
      </div>

      {!adapter.isConfigured() && (
        <div className="flash flash-warn">Akun service Google Drive belum dikonfigurasi. Isi <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> lalu set <code>DRIVE_PROVIDER=google</code>.</div>
      )}

      <div className="card">
        <h2>Hubungkan folder</h2>
        <p className="small muted">Bagikan folder ke <strong className="mono">{adapter.accountLabel()}</strong> (akses Viewer) terlebih dahulu.</p>
        <form action="/api/sources" method="post">
          <div className="form-grid">
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="folder">Tautan / ID folder Drive</label>
              <input id="folder" name="folder" required placeholder="https://drive.google.com/drive/folders/…" />
            </div>
            <div className="field">
              <label htmlFor="name">Nama (opsional)</label>
              <input id="name" name="name" placeholder="mis. Legal – Perizinan" />
            </div>
            <div className="field">
              <label htmlFor="containerKind">Jenis</label>
              <select id="containerKind" name="containerKind" defaultValue="FOLDER">
                <option value="FOLDER">Folder</option>
                <option value="SHARED_DRIVE">Shared Drive</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="sourceType">Tipe akses</label>
              <select id="sourceType" name="sourceType" defaultValue="STANDARD">
                <option value="STANDARD">Standar (L1–2, dibuka langsung di Drive)</option>
                <option value="RESTRICTED">Terbatas (L3–5, hanya lewat CSSE)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="defaultDivisionId">Divisi default</label>
              <select id="defaultDivisionId" name="defaultDivisionId" defaultValue={divisions[0]?.divisionId ?? ''}>
                <option value="">—</option>
                {divisions.map((d) => <option key={d.divisionId} value={d.divisionId}>{d.divisionName}</option>)}
              </select>
            </div>
          </div>
          <button className="btn btn-primary" type="submit"><Icon name="add_link" /> Hubungkan</button>
        </form>
      </div>

      <div className="card card-flush">
        <div className="table-wrap">
          <table>
            <thead><tr><th style={{ paddingLeft: 18 }}>Sumber</th><th>Tipe</th><th>Dokumen</th><th>Scan terakhir</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {sources.length === 0 && <tr><td colSpan={6} className="empty">Belum ada folder terhubung.</td></tr>}
              {sources.map((s) => (
                <tr key={s.sourceId}>
                  <td style={{ paddingLeft: 18 }}>
                    <strong>{s.name}</strong>
                    <div className="small muted mono">{s.externalId}{s.defaultDivisionName ? ` · ${s.defaultDivisionName}` : ''}</div>
                    {s.sourceType === 'RESTRICTED' && s.sharedWith.length > 0 && (
                      <div className="small" style={{ color: 'var(--danger-ink)' }}>
                        <Icon name="warning" size={14} /> Folder terbatas masih dibagikan ke: {s.sharedWith.join(', ')}. Cabut akses tersebut di Drive.
                      </div>
                    )}
                  </td>
                  <td><span className={`badge ${s.sourceType === 'RESTRICTED' ? 'badge-danger' : 'badge-accent'}`}>{s.sourceType === 'RESTRICTED' ? 'Terbatas' : 'Standar'}</span></td>
                  <td>{s.documentCount}</td>
                  <td className="small">
                    {fmtDateTime(s.lastScanAt)}
                    {s.lastScanStatus === 'OK' && 'created' in s.lastScanStats && <div className="muted">{s.lastScanStats.found} file · {s.lastScanStats.created} baru</div>}
                    {s.lastScanStatus === 'ERROR' && <div style={{ color: 'var(--danger-ink)' }}>{s.lastScanError}</div>}
                  </td>
                  <td>
                    {s.status === 'DISABLED' ? <span className="badge badge-muted">Nonaktif</span>
                      : s.authStatus === 'ERROR' ? <span className="badge badge-danger">Otorisasi gagal</span>
                      : <span className="badge badge-ok">Terhubung</span>}
                  </td>
                  <td>
                    <div className="row">
                      {s.status === 'ACTIVE' && (
                        <form action={`/api/sources/${s.sourceId}/scan`} method="post">
                          <button className="btn btn-sm btn-primary" type="submit"><Icon name="sync" /> Scan sekarang</button>
                        </form>
                      )}
                      <form action={`/api/sources/${s.sourceId}/status`} method="post">
                        <input type="hidden" name="status" value={s.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'} />
                        <button className="btn btn-sm" type="submit">{s.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>Scan otomatis berjalan setiap hari pukul 02.00 WIB.</p>
    </>
  )
}
