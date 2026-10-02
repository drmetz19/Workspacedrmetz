import { requireUser, sp, type SearchParams } from '@/lib/session'
import { listUsers } from '@/server/services/users'
import { listDivisions } from '@/server/services/org'
import { Flash } from '@/components/Flash'
import { fmtDateTime, ROLE_LABEL, USER_STATUS_LABEL } from '@/lib/labels'

const STATUS_BADGE: Record<string, string> = { ACTIVE: 'badge-ok', INVITED: 'badge-warn', DEACTIVATED: 'badge-muted' }

export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const users = { data: await listUsers(user) }
  const divisions = await listDivisions(user)

  return (
    <>
      <Flash msg={get('msg')} err={get('err')} />
      <div className="page-head">
        <div>
          <h1>User &amp; Undangan</h1>
          <p>Hanya email yang diundang yang dapat masuk ke CSSE.</p>
        </div>
      </div>

      <div className="card">
        <h2>Undang user</h2>
        <form action="/api/admin/users" method="post">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="name">Nama</label>
              <input id="name" name="name" required />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required placeholder="nama@klinik.id atau @gmail.com" />
            </div>
            <div className="field">
              <label htmlFor="roleId">Role</label>
              <select id="roleId" name="roleId" defaultValue="DIVISION_USER">
                <option value="DIVISION_USER">Division User</option>
                <option value="GM">General Manager</option>
                <option value="OWNER">Owner</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="divisionId">Divisi</label>
              <select id="divisionId" name="divisionId" defaultValue={divisions[0]?.divisionId ?? ''}>
                <option value="">— Tanpa divisi —</option>
                {divisions.map((d) => (
                  <option key={d.divisionId} value={d.divisionId}>{d.divisionName}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <button className="btn btn-primary" type="submit">Kirim undangan</button>
            <span className="field-hint">Owner &amp; GM menerima undangan login Google; Division User bisa Google atau password.</span>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Daftar user</h2>
          <span className="muted small">{users.data.length} user</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Nama</th><th>Email</th><th>Role</th><th>Divisi</th><th>Status</th><th>Login terakhir</th><th></th></tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.userId}>
                  <td>{u.name}</td>
                  <td className="mono">{u.email}</td>
                  <td>{ROLE_LABEL[u.roleId]}</td>
                  <td>{u.divisionName ?? '—'}</td>
                  <td><span className={`badge ${STATUS_BADGE[u.status]}`}>{USER_STATUS_LABEL[u.status]}</span></td>
                  <td className="small">{fmtDateTime(u.lastLoginAt)}</td>
                  <td>
                    <details>
                      <summary className="small" style={{ cursor: 'pointer' }}>Ubah</summary>
                      <form action={`/api/admin/users/${u.userId}`} method="post" className="stack" style={{ minWidth: 220, marginTop: 8 }}>
                        <input name="name" defaultValue={u.name} required aria-label="Nama" />
                        <select name="roleId" defaultValue={u.roleId} aria-label="Role" disabled={u.userId === user.userId}>
                          <option value="DIVISION_USER">Division User</option>
                          <option value="GM">General Manager</option>
                          <option value="OWNER">Owner</option>
                        </select>
                        {u.userId === user.userId && <input type="hidden" name="roleId" value="OWNER" />}
                        <select name="divisionId" defaultValue={u.divisionId ?? ''} aria-label="Divisi">
                          <option value="">— Tanpa divisi —</option>
                          {divisions.map((d) => <option key={d.divisionId} value={d.divisionId}>{d.divisionName}</option>)}
                        </select>
                        <button className="btn btn-sm" type="submit">Simpan</button>
                      </form>
                      {u.userId !== user.userId && (
                        u.status === 'DEACTIVATED' ? (
                          <form action={`/api/admin/users/${u.userId}/reactivate`} method="post" style={{ marginTop: 6 }}>
                            <button className="btn btn-sm" type="submit">Aktifkan kembali</button>
                          </form>
                        ) : (
                          <form action={`/api/admin/users/${u.userId}/deactivate`} method="post" style={{ marginTop: 6 }}>
                            <button className="btn btn-danger btn-sm" type="submit">Nonaktifkan</button>
                          </form>
                        )
                      )}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
