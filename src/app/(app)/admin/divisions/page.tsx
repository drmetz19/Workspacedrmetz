import { requireUser, sp, type SearchParams } from '@/lib/session'
import { listDivisions } from '@/server/services/org'
import { listUserOptions } from '@/server/services/documents'
import { Flash } from '@/components/Flash'

export default async function DivisionsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const [divisions, users] = await Promise.all([listDivisions(user, { includeInactive: true }), listUserOptions(user)])
  return (
    <>
      <Flash msg={get('msg')} err={get('err')} />
      <div className="page-head">
        <div>
          <h1>Divisi</h1>
          <p>Dokumen dan user dikelompokkan per divisi.</p>
        </div>
      </div>
      <div className="card">
        <h2>Tambah divisi</h2>
        <form action="/api/admin/divisions" method="post" className="row">
          <input name="divisionName" placeholder="Nama divisi, mis. Finance" required style={{ maxWidth: 360 }} />
          <button className="btn btn-primary" type="submit">Tambah</button>
        </form>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nama</th><th>User aktif</th><th>Status</th><th>Ubah (nama · penanggung jawab · status)</th></tr></thead>
            <tbody>
              {divisions.map((d) => (
                <tr key={d.divisionId}>
                  <td><strong>{d.divisionName}</strong></td>
                  <td>{d.userCount}</td>
                  <td><span className={`badge ${d.status === 'ACTIVE' ? 'badge-ok' : 'badge-muted'}`}>{d.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}</span></td>
                  <td>
                    <form action={`/api/admin/divisions/${d.divisionId}`} method="post" className="row">
                      <input name="divisionName" defaultValue={d.divisionName} required style={{ maxWidth: 240 }} aria-label="Nama divisi" />
                      <select name="managerUserId" defaultValue={d.managerUserId ?? ''} style={{ maxWidth: 200 }} aria-label="Penanggung jawab">
                        <option value="">— Penanggung jawab —</option>
                        {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
                      </select>
                      <select name="status" defaultValue={d.status} style={{ maxWidth: 130 }} aria-label="Status">
                        <option value="ACTIVE">Aktif</option>
                        <option value="INACTIVE">Nonaktif</option>
                      </select>
                      <button className="btn btn-sm" type="submit">Simpan</button>
                    </form>
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
