import { requireUser, sp, type SearchParams } from '@/lib/session'
import { listCategories } from '@/server/services/org'
import { Flash } from '@/components/Flash'

export default async function CategoriesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const categories = await listCategories(user, { includeInactive: true })
  return (
    <>
      <Flash msg={get('msg')} err={get('err')} />
      <div className="page-head">
        <div>
          <h1>Kategori dokumen</h1>
          <p>Klasifikasi jenis dokumen yang konsisten untuk pencarian dan pengingat.</p>
        </div>
      </div>
      <div className="card">
        <h2>Tambah kategori</h2>
        <form action="/api/admin/categories" method="post" className="row">
          <input name="categoryName" placeholder="Nama kategori" required style={{ maxWidth: 360 }} />
          <button className="btn btn-primary" type="submit">Tambah</button>
        </form>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Kategori</th><th>Status</th><th>Ubah</th></tr></thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.categoryId}>
                  <td><strong>{c.categoryName}</strong></td>
                  <td><span className={`badge ${c.status === 'ACTIVE' ? 'badge-ok' : 'badge-muted'}`}>{c.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}</span></td>
                  <td>
                    <form action={`/api/admin/categories/${c.categoryId}`} method="post" className="row">
                      <input name="categoryName" defaultValue={c.categoryName} required style={{ maxWidth: 240 }} aria-label="Nama kategori" />
                      <select name="status" defaultValue={c.status} style={{ maxWidth: 130 }} aria-label="Status">
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
