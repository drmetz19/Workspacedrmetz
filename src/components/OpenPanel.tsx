import type { DocumentDetail } from '@/server/services/documents'
import type { AccessRequestDto } from '@/server/services/access'
import Link from 'next/link'
import { fmtDateTime } from '@/lib/labels'
import { formatBytes } from '@/lib/upload-types'
import { Icon } from './Icon'

const APPROVER = { GM: 'GM atau Owner', OWNER: 'Owner' } as const

/** Cara membuka dokumen sesuai kebijakan level. */
export function OpenPanel({ doc, myRequest }: { doc: DocumentDetail; myRequest?: AccessRequestDto | null }) {
  const p = doc.permissions
  if (doc.status === 'DRAFT') return null
  if (p.canOpen && doc.fileSource === 'UPLOAD') {
    return (
      <div className="card row" id="open">
        <span className="file-ico"><Icon name={doc.fileMimeType?.startsWith('image/') ? 'image' : doc.fileMimeType === 'application/pdf' ? 'picture_as_pdf' : 'description'} size={20} /></span>
        <div style={{ minWidth: 0 }}>
          <strong className="ellipsis">{doc.fileName ?? 'Berkas dokumen'}</strong>
          <div className="small muted">
            {[formatBytes(doc.fileSize), 'Diunggah ke CSSE', `Level ${doc.securityLevel}`].filter(Boolean).join(' · ')} — setiap pembukaan dicatat di audit.
          </div>
        </div>
        <span className="spacer" />
        <a className="btn btn-primary" href={`/api/files/${doc.documentId}`} target="_blank" rel="noreferrer"><Icon name="visibility" /> Buka berkas</a>
        <a className="btn" href={`/api/files/${doc.documentId}?download=1`}><Icon name="download" /> Unduh</a>
        {myRequest?.status === 'APPROVED' && <div className="small muted" style={{ flexBasis: '100%' }}>Akses sementara berlaku s.d. {fmtDateTime(myRequest.expiresAt)}</div>}
      </div>
    )
  }
  if (p.canOpen && !doc.hasFile) {
    return <div className="card small muted">Belum ada berkas untuk dokumen ini. {p.canEdit && <Link href={`/documents/${doc.documentId}/edit`}>Unggah berkas atau tambahkan tautan Drive</Link>}</div>
  }
  if (p.canOpen && p.openMode === 'DRIVE') {
    return doc.externalUrl ? (
      <div className="card row">
        <div>
          <strong>Dokumen Level {doc.securityLevel}</strong>
          <div className="small muted">
            {doc.securityLevel >= 3
              ? 'Dokumen terbatas. Dibuka di Google Drive — akses file mengikuti setelan berbagi Drive. Setiap pembukaan dicatat di audit.'
              : 'Dapat dibuka langsung di Google Drive.'}
          </div>
        </div>
        <span className="spacer" />
        <a className="btn btn-primary" href={`/api/documents/${doc.documentId}/open-drive`} target="_blank" rel="noreferrer">Buka di Google Drive ↗</a>
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
        {myRequest?.status === 'APPROVED' && <div className="small muted" style={{ flexBasis: '100%' }}>Akses sementara berlaku s.d. {fmtDateTime(myRequest.expiresAt)}</div>}
      </div>
    )
  }
  if (myRequest?.status === 'PENDING') {
    return (
      <div className="card" id="open">
        <span className="badge badge-warn">Menunggu keputusan</span>
        <p className="small" style={{ marginTop: 8 }}>
          Permintaan akses Anda ({fmtDateTime(myRequest.createdAt)}) sedang menunggu keputusan {myRequest.approverRole === 'OWNER' ? 'Owner' : 'GM/Owner'}.
        </p>
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
      {myRequest?.status === 'REJECTED' && (
        <p className="small" style={{ color: 'var(--danger-ink)' }}>Permintaan sebelumnya ditolak: {myRequest.decisionNote}</p>
      )}
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
