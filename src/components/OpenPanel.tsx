import type { DocumentDetail } from '@/server/services/documents'

const APPROVER = { GM: 'GM atau Owner', OWNER: 'Owner' } as const

/** Cara membuka dokumen sesuai kebijakan level. */
export function OpenPanel({ doc }: { doc: DocumentDetail }) {
  const p = doc.permissions
  if (doc.status === 'DRAFT') return null
  if (p.canOpen && p.openMode === 'DRIVE') {
    return doc.externalUrl ? (
      <div className="card row">
        <div>
          <strong>Dokumen Level {doc.securityLevel}</strong>
          <div className="small muted">Dapat dibuka langsung di Google Drive.</div>
        </div>
        <span className="spacer" />
        <a className="btn btn-primary" href={doc.externalUrl} target="_blank" rel="noreferrer">Buka di Google Drive ↗</a>
      </div>
    ) : (
      <div className="card small muted">Belum ada tautan Drive untuk dokumen ini.</div>
    )
  }
  if (p.canOpen && p.openMode === 'CSSE') {
    return (
      <div className="card row" id="open">
        <div>
          <strong>Dokumen terbatas (L{doc.securityLevel})</strong>
          <div className="small muted">Hanya dapat dibuka melalui CSSE. Setiap pembukaan dicatat di audit.</div>
        </div>
        <span className="spacer" />
        <a className="btn btn-primary" href={`/api/files/${doc.documentId}`} target="_blank" rel="noreferrer">Buka lewat CSSE</a>
        <a className="btn" href={`/api/files/${doc.documentId}?download=1`}>Unduh</a>
      </div>
    )
  }
  return (
    <div className="card" id="open">
      <strong>Anda belum dapat membuka dokumen ini</strong>
      <p className="small muted" style={{ marginTop: 4 }}>
        {p.denyReason === 'OWNER_APPROVAL_REQUIRED'
          ? 'Dokumen ini wajib persetujuan Owner.'
          : `Dokumen Level ${doc.securityLevel} hanya dapat dibuka oleh pihak yang berwenang.`}
        {p.canRequestAccess && p.approver && ` Ajukan permintaan akses — akan diputuskan oleh ${APPROVER[p.approver]}.`}
      </p>
      {p.canRequestAccess && (
        <form action="/api/access-requests" method="post" className="stack" style={{ maxWidth: 560 }}>
          <input type="hidden" name="documentId" value={doc.documentId} />
          <textarea name="reason" required minLength={5} placeholder="Alasan membutuhkan akses" />
          <div><button className="btn btn-primary" type="submit">Ajukan permintaan akses</button></div>
        </form>
      )}
    </div>
  )
}
