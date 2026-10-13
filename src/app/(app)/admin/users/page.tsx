import { requireUser, sp, type SearchParams } from '@/lib/session'
import { defaultPasswordFor, listUsers } from '@/server/services/users'
import { listDivisions } from '@/server/services/org'
import { Flash } from '@/components/Flash'
import { fmtDateTime, ROLE_LABEL, USER_STATUS_LABEL } from '@/lib/labels'

const STATUS_BADGE: Record<string, string> = { ACTIVE: 'badge-ok', INVITED: 'badge-warn', DEACTIVATED: 'badge-muted' }

export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const users = { data: await listUsers(user) }
  const divisions = await listDivisions(user)
  const pending = users.data.filter((u) => u.roleId === 'DIVISION_USER' && u.status === 'INVITED' && !u.mustChangePassword).length

  return (
    <>
      <Flash msg={get('msg')} err={get('err')} />
      <div className="page-head">
        <div>
          <h1>User &amp; Akun</h1>
          <p>Hanya email yang terdaftar di sini yang dapat masuk ke CSSE.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Login akun divisi</h2>
          <span className="muted small">pola: NamaDivisi@DrMetz2026</span>
        </div>
        <p className="small muted">
          Staf divisi langsung masuk di halaman login dengan <strong>email masing-masing</strong> + <strong>password default divisinya</strong>.
          Saat masuk pertama, sistem meminta mereka membuat password baru sendiri (password default tidak bisa dipakai terus).
        </p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Divisi</th><th>Password default</th><th>Jumlah user</th></tr></thead>
            <tbody>
              {divisions.map((d) => (
                <tr key={d.divisionId}>
                  <td>{d.divisionName}</td>
                  <td className="mono">{defaultPasswordFor(d.divisionName)}</td>
                  <td>{d.userCount ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action="/api/admin/users/default-passwords" method="post" className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" type="submit" disabled={pending === 0}>
            Aktifkan password default untuk {pending} user yang belum pernah masuk
          </button>
          <span className="field-hint">Hanya Division User berstatus Diundang yang belum punya password default. Detail login dikirim ke email masing-masing.</span>
        </form>
      </div>

      <div className="card">
        <h2>Tambah user</h2>
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
            <div className="field">
              <label htmlFor="loginMode">Cara masuk (Division User)</label>
              <select id="loginMode" name="loginMode" defaultValue="DEFAULT_PASSWORD">
                <option value="DEFAULT_PASSWORD">Password default divisi</option>
                <option value="INVITE_LINK">Tautan buat password sendiri</option>
              </select>
            </div>
          </div>
          <div className="row">
            <button className="btn btn-primary" type="submit">Simpan user</button>
            <span className="field-hint">Owner &amp; GM selalu masuk dengan Google; pilihan cara masuk hanya berlaku untuk Division User.</span>
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
                  <td>
                    <span className={`badge ${STATUS_BADGE[u.status]}`}>{USER_STATUS_LABEL[u.status]}</span>
                    {u.mustChangePassword && u.status !== 'DEACTIVATED' && <div className="small muted">password default</div>}
                  </td>
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
                      {u.roleId === 'DIVISION_USER' && u.status !== 'DEACTIVATED' && (
                        <form action={`/api/admin/users/${u.userId}/default-password`} method="post" style={{ marginTop: 6 }}>
                          <button className="btn btn-sm" type="submit">Reset ke password default</button>
                        </form>
                      )}
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
