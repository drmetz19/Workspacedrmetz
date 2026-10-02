import Link from 'next/link'
import { requireUser, sp, type SearchParams } from '@/lib/session'
import { searchDocuments } from '@/server/services/search'
import { listCategories, listDivisions } from '@/server/services/org'
import { listUserOptions } from '@/server/services/documents'
import { guard } from '@/lib/page-guard'
import { Flash } from '@/components/Flash'
import { ExpiryBadge, LevelBadge, LEVEL_NAME, StatusBadge } from '@/components/Badges'
import { Icon } from '@/components/Icon'

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { raw, get } = await sp(searchParams)
  const levels = [raw.securityLevel].flat().filter(Boolean) as string[]
  const input = {
    q: get('q'), categoryId: get('categoryId'), divisionId: get('divisionId'), picUserId: get('picUserId'),
    securityLevel: levels, status: get('status') || undefined, expiry: get('expiry') || undefined,
    expiryFrom: get('expiryFrom'), expiryTo: get('expiryTo'), effectiveFrom: get('effectiveFrom'), effectiveTo: get('effectiveTo'),
  }
  const [res, categories, divisions, users] = await Promise.all([
    guard(() => searchDocuments(user, input)),
    listCategories(user, { includeInactive: true }),
    listDivisions(user),
    listUserOptions(user),
  ])
  const division = divisions.find((d) => d.divisionId === get('divisionId'))
  const hasFilter = Object.values(input).some((v) => (Array.isArray(v) ? v.length : v))

  return (
    <>
      <Flash err={res.ok ? get('err') : res.message} />
      <div className="page-head">
        <div>
          <div className="crumbs"><Icon name="search" size={14} /> Pencarian terstruktur</div>
          <h1>{division ? `Divisi ${division.divisionName}` : 'Cari dokumen'}</h1>
          <p>Hasil selalu dibatasi izin Anda. Kombinasikan filter untuk mempersempit.</p>
        </div>
      </div>

      <form className="card" method="get" action="/search">
        <div className="form-grid">
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="q">Kata kunci</label>
            <input id="q" name="q" defaultValue={get('q') ?? ''} placeholder="Nama, nomor, kategori, PIC…" />
          </div>
          <div className="field">
            <label htmlFor="categoryId">Kategori</label>
            <select id="categoryId" name="categoryId" defaultValue={get('categoryId') ?? ''}>
              <option value="">Semua</option>
              {categories.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="divisionId">Divisi</label>
            <select id="divisionId" name="divisionId" defaultValue={get('divisionId') ?? ''}>
              <option value="">Semua</option>
              {divisions.map((d) => <option key={d.divisionId} value={d.divisionId}>{d.divisionName}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="picUserId">PIC</label>
            <select id="picUserId" name="picUserId" defaultValue={get('picUserId') ?? ''}>
              <option value="">Semua</option>
              {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={get('status') ?? 'ACTIVE'}>
              <option value="ACTIVE">Aktif</option>
              <option value="INACTIVE">Arsip &amp; versi lama</option>
              <option value="ALL">Semua</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="expiry">Kedaluwarsa</label>
            <select id="expiry" name="expiry" defaultValue={get('expiry') ?? ''}>
              <option value="">Semua</option>
              <option value="within30">≤ 30 hari lagi</option>
              <option value="within90">≤ 90 hari lagi</option>
              <option value="expired">Sudah lewat</option>
              <option value="none">Tanpa tanggal</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="expiryFrom">Kedaluwarsa dari</label>
            <input id="expiryFrom" name="expiryFrom" type="date" defaultValue={get('expiryFrom') ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="expiryTo">Kedaluwarsa sampai</label>
            <input id="expiryTo" name="expiryTo" type="date" defaultValue={get('expiryTo') ?? ''} />
          </div>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: '0 0 12px' }}>
          <legend style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>Level keamanan</legend>
          <div className="row">
            {[1, 2, 3, 4, 5].map((l) => (
              <label key={l} className="row" style={{ gap: 6, margin: 0, fontWeight: 500 }}>
                <input type="checkbox" name="securityLevel" value={l} defaultChecked={levels.includes(String(l))} /> L{l} · {LEVEL_NAME[l]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="row">
          <button className="btn btn-primary" type="submit"><Icon name="search" /> Cari</button>
          {hasFilter && <Link className="btn" href="/search">Reset</Link>}
        </div>
      </form>

      {res.ok && (
        <div className="card card-flush" style={{ marginTop: 16 }}>
          <div className="row" style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)' }}>
            <strong>{res.data.total} hasil</strong>
            <span className="badge badge-ok"><Icon name="verified_user" size={12} /> Dibatasi izin Anda</span>
          </div>
          {res.data.results.length === 0 ? (
            <div className="empty">Tidak ada dokumen yang cocok dan boleh Anda akses.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Dokumen</th><th>Kategori</th><th>Level</th><th>PIC</th><th>Status</th><th>Kedaluwarsa</th></tr></thead>
                <tbody>
                  {res.data.results.map((d) => (
                    <tr key={d.documentId}>
                      <td style={{ paddingLeft: 18 }}>
                        <Link href={`/documents/${d.documentId}`}><strong>{d.documentName}</strong></Link>
                        <div className="small muted">{d.documentNumber ?? '—'} · v{d.version}{d.divisionName ? ` · ${d.divisionName}` : ''}</div>
                        {d.status === 'SUPERSEDED' && d.supersededByDocumentId && (
                          <div className="small">Tidak berlaku — <Link href={`/documents/${d.supersededByDocumentId}`}>lihat versi aktif</Link></div>
                        )}
                      </td>
                      <td>{d.categoryName ?? '—'}</td>
                      <td><LevelBadge level={d.securityLevel} /></td>
                      <td>{d.picName ?? '—'}</td>
                      <td><StatusBadge status={d.status} /></td>
                      <td><ExpiryBadge date={d.expiryDate} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  )
}
