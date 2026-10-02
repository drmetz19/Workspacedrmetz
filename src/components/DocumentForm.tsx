import type { DocumentDto } from '@/server/services/documents'
import type { CategoryDto, DivisionDto } from '@/server/services/org'
import { LEVEL_NAME } from './Badges'

interface Props {
  action: string
  doc?: DocumentDto
  categories: CategoryDto[]
  divisions: DivisionDto[]
  users: { user_id: string; name: string; email: string; division_name: string | null }[]
  replaceable?: { documentId: string; documentName: string; version: number }[]
  canSetLevel?: boolean
  submitLabel: string
  defaultDivisionId?: string | null
}

export function DocumentForm({ action, doc, categories, divisions, users, replaceable, canSetLevel = true, submitLabel, defaultDivisionId }: Props) {
  return (
    <form action={action} method="post" className="card">
      <div className="field">
        <label htmlFor="documentName">Nama dokumen</label>
        <input id="documentName" name="documentName" required minLength={3} defaultValue={doc?.documentName} placeholder="mis. Izin Operasional Klinik Jakarta" />
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="documentNumber">Nomor dokumen</label>
          <input id="documentNumber" name="documentNumber" defaultValue={doc?.documentNumber ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="categoryId">Kategori</label>
          <select id="categoryId" name="categoryId" defaultValue={doc?.categoryId ?? ''}>
            <option value="">— Pilih —</option>
            {categories.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="divisionId">Divisi</label>
          <select id="divisionId" name="divisionId" defaultValue={doc?.divisionId ?? defaultDivisionId ?? ''}>
            <option value="">— Pilih —</option>
            {divisions.map((d) => <option key={d.divisionId} value={d.divisionId}>{d.divisionName}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="picUserId">PIC (penanggung jawab)</label>
          <select id="picUserId" name="picUserId" defaultValue={doc?.picUserId ?? ''}>
            <option value="">— Belum ditentukan —</option>
            {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}{u.division_name ? ` · ${u.division_name}` : ''}</option>)}
          </select>
        </div>
        {!doc && (
          <div className="field">
            <label htmlFor="securityLevel">Level keamanan</label>
            <select id="securityLevel" name="securityLevel" defaultValue="2" disabled={!canSetLevel}>
              {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>L{l} · {LEVEL_NAME[l]}</option>)}
            </select>
            {!canSetLevel && <input type="hidden" name="securityLevel" value="2" />}
          </div>
        )}
        <div className="field">
          <label htmlFor="effectiveDate">Tanggal berlaku</label>
          <input id="effectiveDate" name="effectiveDate" type="date" defaultValue={doc?.effectiveDate ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="expiryDate">Tanggal kedaluwarsa</label>
          <input id="expiryDate" name="expiryDate" type="date" defaultValue={doc?.expiryDate ?? ''} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="externalUrl">Tautan / ID file Google Drive</label>
        <input id="externalUrl" name="externalUrl" defaultValue={doc?.externalUrl ?? ''} placeholder="https://drive.google.com/file/d/…" />
        <div className="field-hint">CSSE menyimpan ID file sebagai referensi; file tetap berada di Google Drive.</div>
      </div>
      <div className="field">
        <label htmlFor="confirmedSummary">Ringkasan singkat</label>
        <textarea id="confirmedSummary" name="confirmedSummary" defaultValue={doc?.confirmedSummary ?? ''} placeholder="Pihak, cakupan, catatan penting" />
      </div>
      {replaceable && replaceable.length > 0 && (
        <div className="field">
          <label htmlFor="supersedesDocumentId">Menggantikan dokumen (opsional)</label>
          <select id="supersedesDocumentId" name="supersedesDocumentId" defaultValue="">
            <option value="">— Bukan versi baru —</option>
            {replaceable.map((d) => <option key={d.documentId} value={d.documentId}>{d.documentName} (v{d.version})</option>)}
          </select>
          <div className="field-hint">Dokumen lama akan ditandai "tidak berlaku".</div>
        </div>
      )}
      <div className="row">
        <button className="btn btn-primary" type="submit">{submitLabel}</button>
      </div>
    </form>
  )
}
