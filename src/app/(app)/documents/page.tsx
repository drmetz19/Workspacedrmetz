import Link from 'next/link'
import { requireUser, sp, type SearchParams } from '@/lib/session'
import { directoryCounts } from '@/server/services/documents'
import { searchDocuments, todayJakarta, type SearchFilters } from '@/server/services/search'
import { Flash } from '@/components/Flash'
import { Icon } from '@/components/Icon'
import { LevelBadge, daysUntil } from '@/components/Badges'
import { ValidityBadge } from '@/components/ValidityBadge'
import { initials } from '@/lib/initials'

const PAGE_SIZE = 10

const STATUS_OPTIONS = [
  { key: 'active', label: 'Semua status aktif' },
  { key: 'expiring', label: 'Akan berakhir (≤ 90 hari)' },
  { key: 'expired', label: 'Sudah kedaluwarsa' },
  { key: 'mine', label: 'Saya penanggung jawab' },
  { key: 'inactive', label: 'Arsip & versi lama' },
] as const
type StatusKey = (typeof STATUS_OPTIONS)[number]['key']

/** Tab lama (?tab=inactive|mine) tetap berfungsi. */
const LEGACY_TAB: Record<string, StatusKey> = { inactive: 'inactive', mine: 'mine', all: 'active' }

const fmtNum = (n: number) => n.toLocaleString('id-ID')

export default async function DocumentsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const division = get('division') || null
  const status: StatusKey = (STATUS_OPTIONS.find((s) => s.key === get('status'))?.key ?? LEGACY_TAB[get('tab') ?? ''] ?? 'active')
  const year = /^\d{4}$/.test(get('year') ?? '') ? get('year')! : ''
  const q = (get('q') ?? '').slice(0, 200)
  const page = Math.max(1, Number(get('page')) || 1)
  const linkMode = process.env.DRIVE_PROVIDER === 'link'

  const filters: SearchFilters = {
    q,
    divisionId: division ?? undefined,
    status: status === 'inactive' ? 'INACTIVE' : 'ACTIVE',
    expiry: status === 'expiring' ? 'within90' : status === 'expired' ? 'expired' : undefined,
    picUserId: status === 'mine' ? user.userId : undefined,
    year: year || undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  }
  const [counts, res] = await Promise.all([directoryCounts(user), searchDocuments(user, filters)])
  const pages = Math.max(1, Math.ceil(res.total / PAGE_SIZE))
  const thisYear = Number(todayJakarta().slice(0, 4))
  const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2, thisYear - 3]

  const href = (over: Record<string, string | number | null>) => {
    const p = new URLSearchParams()
    const cur: Record<string, string | number | null> = { division, status: status === 'active' ? null : status, year: year || null, q: q || null, page: null, ...over }
    for (const [k, v] of Object.entries(cur)) if (v !== null && v !== '' && !(k === 'page' && v === 1)) p.set(k, String(v))
    const s = p.toString()
    return `/documents${s ? `?${s}` : ''}`
  }

  const from = res.total ? (page - 1) * PAGE_SIZE + 1 : 0
  const to = Math.min(page * PAGE_SIZE, res.total)

  return (
    <>
      <Flash msg={get('msg')} err={get('err')} />
      <div className="page-head">
        <div>
          <h1 className="row" style={{ gap: 10 }}>
            Direktori Dokumen Divisi <span className="badge badge-accent">Sesuai izin Anda</span>
          </h1>
          <p>Pilih divisi untuk melihat dokumen, masa berlaku izin, dan penanggung jawab berkas.</p>
        </div>
        <div className="row">
          <Link className="btn" href="/search"><Icon name="tune" /> Filter Lanjutan</Link>
          <Link className="btn btn-primary" href="/documents/new"><Icon name="add" /> Unggah / Daftarkan Berkas</Link>
        </div>
      </div>

      <nav className="seg" aria-label="Divisi">
        <Link href={href({ division: null })} className={`seg-item${!division ? ' active' : ''}`}>
          Semua Divisi <span className="count">{fmtNum(counts.total)}</span>
        </Link>
        {counts.byDivision.filter((d) => d.divisionId).map((d) => (
          <Link key={d.divisionId} href={href({ division: d.divisionId })} className={`seg-item${division === d.divisionId ? ' active' : ''}`}>
            {d.divisionName} <span className="count">{fmtNum(d.count)}</span>
          </Link>
        ))}
      </nav>

      <div className="card card-flush">
        <form className="dir-filters" action="/documents" method="get">
          {division && <input type="hidden" name="division" value={division} />}
          <label className="dir-filter">
            <span>Status</span>
            <select name="status" defaultValue={status}>
              {STATUS_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <label className="dir-filter">
            <span>Tahun</span>
            <select name="year" defaultValue={year}>
              <option value="">Semua tahun</option>
              {years.map((y) => <option key={y} value={y}>{y}{y === thisYear ? ' (berjalan)' : ''}</option>)}
            </select>
          </label>
          <span className="spacer" />
          <label className="dir-search">
            <Icon name="search" size={16} />
            <input name="q" defaultValue={q} placeholder="Saring dalam daftar ini…" aria-label="Saring dalam daftar ini" />
          </label>
          <button className="btn btn-sm" type="submit">Terapkan</button>
        </form>

        {res.results.length === 0 ? (
          <div className="empty">
            {status === 'inactive' ? 'Tidak ada arsip atau versi lama.' : q || year || division || status !== 'active' ? 'Tidak ada dokumen yang cocok dengan filter ini.' : 'Belum ada dokumen di sini.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="dir-table">
              <thead>
                <tr>
                  <th>Nama dokumen &amp; nomor berkas</th>
                  <th>Divisi</th>
                  <th>Penanggung jawab (PIC)</th>
                  <th>Masa berlaku / status</th>
                  <th>Berkas</th>
                  <th style={{ textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {res.results.map((d) => {
                  const days = daysUntil(d.expiryDate)
                  const renew = d.status === 'ACTIVE' && days !== null && days <= 90 && (user.roleId !== 'DIVISION_USER' || d.picUserId === user.userId)
                  const openHref = d.openMode === 'DRIVE' ? `/api/documents/${d.documentId}/open-drive` : `/api/files/${d.documentId}`
                  return (
                    <tr key={d.documentId}>
                      <td>
                        <div className="doc-cell">
                          <span className="doc-icon"><Icon name="description" size={18} /></span>
                          <div>
                            <div className="row" style={{ gap: 8 }}>
                              <Link href={`/documents/${d.documentId}`}><strong>{d.documentName}</strong></Link>
                              <LevelBadge level={d.securityLevel} />
                            </div>
                            <div className="small muted">
                              <span className="mono">{d.documentNumber ?? (d.canOpen ? 'Tanpa nomor' : 'Nomor disembunyikan')}</span>
                              {' · '}{d.categoryName ?? 'Tanpa kategori'} · v{d.version}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{d.divisionName ? <span className="badge badge-accent">{d.divisionName}</span> : <span className="muted">—</span>}</td>
                      <td>
                        {d.picName ? (
                          <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                            <span className="avatar avatar-sm">{initials(d.picName)}</span>{d.picName}
                          </span>
                        ) : <span className="muted">Belum ditentukan</span>}
                      </td>
                      <td><ValidityBadge doc={d} /></td>
                      <td>
                        {d.flags.sourceMissing ? <span className="drive-state warn"><Icon name="cloud_off" size={15} /> Sumber hilang</span>
                          : d.fileSource === 'UPLOAD' ? <span className="drive-state ok"><Icon name="upload_file" size={15} /> Diunggah</span>
                          : d.hasFile ? <span className="drive-state ok"><Icon name="cloud_done" size={15} /> {linkMode ? 'Tautan Drive' : 'Tersinkron'}</span>
                          : <span className="drive-state"><Icon name="link_off" size={15} /> Belum ada berkas</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="row" style={{ justifyContent: 'flex-end', gap: 6, flexWrap: 'nowrap' }}>
                          {renew && <Link className="btn btn-sm btn-warn" href={`/documents/new?supersedes=${d.documentId}`}>Perpanjang</Link>}
                          {d.canOpen && d.hasFile ? (
                            <a className="btn btn-sm" href={openHref} target="_blank" rel="noreferrer">Buka Berkas</a>
                          ) : !d.canOpen ? (
                            <Link className="btn btn-sm" href={`/documents/${d.documentId}#open`}>Minta Akses</Link>
                          ) : (
                            <Link className="btn btn-sm" href={`/documents/${d.documentId}`}>Detail</Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="dir-foot">
          <span className="small muted">Menampilkan {fmtNum(from)}–{fmtNum(to)} dari {fmtNum(res.total)} berkas sesuai filter</span>
          {pages > 1 && (
            <nav className="pager" aria-label="Halaman">
              {page > 1 ? <Link className="btn btn-sm" href={href({ page: page - 1 })}>Sebelumnya</Link> : <span className="btn btn-sm" aria-disabled="true">Sebelumnya</span>}
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1)
                .map((n, i, arr) => (
                  <span key={n} className="row" style={{ gap: 4 }}>
                    {i > 0 && n - arr[i - 1] > 1 && <span className="muted">…</span>}
                    <Link className={`btn btn-sm${n === page ? ' btn-primary' : ''}`} href={href({ page: n })} aria-current={n === page ? 'page' : undefined}>{n}</Link>
                  </span>
                ))}
              {page < pages ? <Link className="btn btn-sm" href={href({ page: page + 1 })}>Berikutnya</Link> : <span className="btn btn-sm" aria-disabled="true">Berikutnya</span>}
            </nav>
          )}
        </div>
      </div>

      <div className="card drive-card">
        <span className="drive-card-icon"><Icon name={linkMode ? 'upload_file' : 'cloud_sync'} size={22} /></span>
        <div>
          <strong>{linkMode ? 'Unggah berkas atau tautkan dari Google Drive' : 'Folder Google Drive tersinkronisasi otomatis'}</strong>
          <p className="small muted" style={{ margin: '2px 0 0' }}>
            {linkMode
              ? 'Saat mendaftarkan dokumen, pilih "Unggah file" (PDF/gambar/Word/Excel, maks 25 MB — disimpan privat di CSSE) atau tempel tautan file/folder Google Drive. CSSE menyaring siapa yang boleh membuka & mencatat setiap pembukaan.'
              : 'Folder Drive yang terhubung dipindai setiap hari pukul 02.00 WIB. File baru masuk antrean review sebelum tampil di direktori.'}
          </p>
        </div>
        {linkMode ? (
          <Link className="btn btn-primary" href="/documents/new"><Icon name="add" /> Daftarkan Berkas</Link>
        ) : (user.roleId === 'OWNER' || user.roleId === 'GM') ? (
          <Link className="btn" href="/admin/sources"><Icon name="sync" /> Sumber &amp; Sinkronisasi</Link>
        ) : null}
      </div>
    </>
  )
}
