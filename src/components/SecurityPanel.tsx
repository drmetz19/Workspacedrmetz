import type { DocumentDetail } from '@/server/services/documents'
import type { PermissionDto } from '@/server/services/permissions'
import type { DivisionDto } from '@/server/services/org'
import { LEVEL_NAME } from './Badges'
import { fmtDate } from '@/lib/labels'

const PERM_LABEL: Record<string, string> = { VIEW: 'Lihat metadata', OPEN: 'Buka dokumen', EDIT_METADATA: 'Ubah metadata', DOWNLOAD: 'Unduh' }

/** Panel khusus Owner: level keamanan, wajib persetujuan Owner, dan izin eksplisit. */
export function SecurityPanel({ doc, grants, users, divisions }: {
  doc: DocumentDetail
  grants: PermissionDto[]
  users: { user_id: string; name: string; email: string }[]
  divisions: DivisionDto[]
}) {
  return (
    <div className="card">
      <h2>Keamanan &amp; izin</h2>
      <div className="grid grid-2">
        <form action={`/api/documents/${doc.documentId}/level`} method="post">
          <label htmlFor="securityLevel">Level keamanan</label>
          <div className="row">
            <select id="securityLevel" name="securityLevel" defaultValue={doc.securityLevel} style={{ flex: 1 }}>
              {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>L{l} · {LEVEL_NAME[l]}</option>)}
            </select>
            <button className="btn btn-sm" type="submit">Simpan</button>
          </div>
          <div className="field-hint">L1–2 dibuka langsung di Drive. L3–5 hanya lewat CSSE (file di Shared Drive terbatas).</div>
        </form>
        <form action={`/api/documents/${doc.documentId}/owner-approval`} method="post">
          <label>Persetujuan Owner</label>
          <input type="hidden" name="required" value={doc.ownerApprovalRequired ? 'false' : 'true'} />
          <div className="row">
            <span className={`badge ${doc.ownerApprovalRequired ? 'badge-warn' : 'badge-muted'}`}>
              {doc.ownerApprovalRequired ? 'Wajib persetujuan Owner' : 'Tidak wajib'}
            </span>
            <button className="btn btn-sm" type="submit">{doc.ownerApprovalRequired ? 'Matikan' : 'Wajibkan'}</button>
          </div>
          <div className="field-hint">Jika aktif, GM tidak bisa membuka/mengubah tanpa persetujuan Owner.</div>
        </form>
      </div>

      <h3 style={{ marginTop: 18 }}>Izin eksplisit</h3>
      {grants.length === 0 ? (
        <p className="small muted">Belum ada. Akses mengikuti kebijakan level.</p>
      ) : (
        <ul className="list">
          {grants.map((g) => (
            <li key={g.permissionId} className="row">
              <div>
                <strong>{g.principalLabel}</strong> · {PERM_LABEL[g.permissionType] ?? g.permissionType}
                <div className="small muted">
                  {g.expiresAt ? `berlaku s.d. ${fmtDate(g.expiresAt)}` : 'tanpa batas waktu'} · oleh {g.grantedByName ?? '—'}
                  {g.source === 'ACCESS_REQUEST' ? ' · dari permintaan akses' : ''}{!g.active ? ' · kedaluwarsa' : ''}
                </div>
              </div>
              <span className="spacer" />
              <form action={`/api/documents/${doc.documentId}/permissions/${g.permissionId}/revoke`} method="post">
                <button className="btn btn-danger btn-sm" type="submit">Cabut</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={`/api/documents/${doc.documentId}/permissions`} method="post" style={{ marginTop: 12 }}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="principal">Untuk</label>
            <select id="principal" name="principal" required defaultValue="">
              <option value="" disabled>— Pilih —</option>
              <optgroup label="User">
                {users.map((u) => <option key={u.user_id} value={`USER:${u.user_id}`}>{u.name} ({u.email})</option>)}
              </optgroup>
              <optgroup label="Divisi">
                {divisions.map((d) => <option key={d.divisionId} value={`DIVISION:${d.divisionId}`}>{d.divisionName}</option>)}
              </optgroup>
              <optgroup label="Role">
                <option value="ROLE:GM">Semua GM</option>
                <option value="ROLE:DIVISION_USER">Semua Division User</option>
              </optgroup>
            </select>
          </div>
          <div className="field">
            <label htmlFor="permissionType">Hak</label>
            <select id="permissionType" name="permissionType" defaultValue="OPEN">
              <option value="VIEW">Lihat metadata</option>
              <option value="OPEN">Buka dokumen</option>
              <option value="EDIT_METADATA">Ubah metadata</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="expiresAt">Berlaku sampai</label>
            <input id="expiresAt" name="expiresAt" type="date" />
          </div>
        </div>
        <button className="btn btn-sm" type="submit">Tambah izin</button>
      </form>
    </div>
  )
}
