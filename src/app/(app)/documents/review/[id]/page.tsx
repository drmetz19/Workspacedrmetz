import Link from 'next/link'
import { requireUser, sp, type SearchParams } from '@/lib/session'
import { getDraftForReview } from '@/server/services/review'
import { listCategories, listDivisions } from '@/server/services/org'
import { listUserOptions } from '@/server/services/documents'
import { maxLevelOnCreate } from '@/server/permissions/engine'
import { guard } from '@/lib/page-guard'
import { Flash } from '@/components/Flash'
import { AccessDenied } from '@/components/AccessDenied'
import { LEVEL_NAME } from '@/components/Badges'
import { Icon } from '@/components/Icon'

function Hint({ value }: { value?: string | number | null }) {
  if (value === undefined || value === null || value === '') return null
  return <div className="field-hint"><span className="badge badge-muted">Saran</span> {String(value)} — periksa sebelum menyimpan</div>
}

export default async function ReviewDraftPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const user = await requireUser()
  const { id } = await params
  const { get } = await sp(searchParams)
  const res = await guard(() => getDraftForReview(user, id))
  if (!res.ok) return <AccessDenied message={res.message} />
  const d = res.data
  const s = d.suggested
  const [categories, divisions, users] = await Promise.all([listCategories(user), listDivisions(user), listUserOptions(user)])
  const catId = d.categoryId ?? categories.find((c) => c.categoryName === s.categoryName)?.categoryId ?? ''
  const divId = d.divisionId ?? divisions.find((x) => x.divisionName === s.divisionName)?.divisionId ?? ''
  const picId = d.picUserId ?? users.find((u) => s.picName && u.name.toLowerCase() === s.picName.toLowerCase())?.user_id ?? ''
  const minLevel = d.restrictedSource ? 3 : 1
  const maxLevel = maxLevelOnCreate(user)
  const level = Math.min(Math.max(s.securityLevel ?? d.securityLevel, minLevel), maxLevel)
  const ai = d.suggestions.find((x) => x.source === 'AI')

  return (
    <>
      <Flash err={get('err')} />
      <div className="page-head">
        <div>
          <div className="crumbs"><Link href="/documents/review">Antrean review</Link> / Draft</div>
          <h1>{d.documentName}</h1>
          <p>
            Sumber: {d.sourceName ?? '—'} {d.restrictedSource && <span className="badge badge-danger">Folder terbatas</span>}
          </p>
        </div>
      </div>
      <div className="flash flash-warn">
        <Icon name="info" size={16} /> Field bertanda <strong>Saran</strong> berasal dari {ai ? `AI (${ai.inputScope === 'CONTENT' ? 'membaca isi file' : 'hanya nama file & metadata'})` : 'nama file'} dan belum diverifikasi. Dokumen baru bisa dicari setelah Anda konfirmasi.
      </div>
      <form action={`/api/documents/${d.documentId}/confirm`} method="post" className="card">
        <div className="field">
          <label htmlFor="documentName">Nama dokumen</label>
          <input id="documentName" name="documentName" required minLength={3} defaultValue={s.documentName ?? d.documentName} />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="documentNumber">Nomor dokumen</label>
            <input id="documentNumber" name="documentNumber" defaultValue={d.documentNumber ?? s.documentNumber ?? ''} />
            <Hint value={s.documentNumber} />
          </div>
          <div className="field">
            <label htmlFor="categoryId">Kategori</label>
            <select id="categoryId" name="categoryId" defaultValue={catId}>
              <option value="">— Pilih —</option>
              {categories.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>)}
            </select>
            <Hint value={s.categoryName} />
          </div>
          <div className="field">
            <label htmlFor="divisionId">Divisi</label>
            <select id="divisionId" name="divisionId" defaultValue={divId}>
              <option value="">— Pilih —</option>
              {divisions.map((x) => <option key={x.divisionId} value={x.divisionId}>{x.divisionName}</option>)}
            </select>
            <Hint value={s.divisionName} />
          </div>
          <div className="field">
            <label htmlFor="picUserId">PIC</label>
            <select id="picUserId" name="picUserId" defaultValue={picId}>
              <option value="">— Belum ditentukan —</option>
              {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
            </select>
            <Hint value={s.picName} />
          </div>
          <div className="field">
            <label htmlFor="securityLevel">Level keamanan</label>
            <select id="securityLevel" name="securityLevel" defaultValue={level}>
              {[1, 2, 3, 4, 5].filter((l) => l >= minLevel && l <= maxLevel).map((l) => <option key={l} value={l}>L{l} · {LEVEL_NAME[l]}</option>)}
            </select>
            <Hint value={s.securityLevel ? `L${s.securityLevel}` : null} />
          </div>
          <div className="field">
            <label htmlFor="effectiveDate">Tanggal berlaku</label>
            <input id="effectiveDate" name="effectiveDate" type="date" defaultValue={d.effectiveDate ?? s.effectiveDate ?? ''} />
            <Hint value={s.effectiveDate} />
          </div>
          <div className="field">
            <label htmlFor="expiryDate">Tanggal kedaluwarsa</label>
            <input id="expiryDate" name="expiryDate" type="date" defaultValue={d.expiryDate ?? s.expiryDate ?? ''} />
            <Hint value={s.expiryDate} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="confirmedSummary">Ringkasan</label>
          <textarea id="confirmedSummary" name="confirmedSummary" defaultValue={d.confirmedSummary ?? s.summary ?? ''} />
          <Hint value={s.summary ? 'ringkasan dari AI' : null} />
        </div>
        <div className="row">
          <button className="btn btn-primary" type="submit"><Icon name="task_alt" /> Konfirmasi &amp; aktifkan</button>
        </div>
      </form>
      <form action={`/api/documents/${d.documentId}/reject`} method="post" className="card row">
        <input name="note" placeholder="Alasan menolak (mis. bukan dokumen legal)" style={{ flex: 1, minWidth: 220 }} />
        <button className="btn btn-danger" type="submit">Tolak draft</button>
      </form>
    </>
  )
}
