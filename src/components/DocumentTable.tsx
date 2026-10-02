import Link from 'next/link'
import type { DocumentDto } from '@/server/services/documents'
import { ExpiryBadge, LevelBadge, StatusBadge } from './Badges'

export function DocumentTable({ docs, empty = 'Belum ada dokumen.' }: { docs: DocumentDto[]; empty?: string }) {
  if (!docs.length) return <div className="empty">{empty}</div>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Dokumen</th><th>Kategori</th><th>Level</th><th>PIC</th><th>Status</th><th>Kedaluwarsa</th></tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.documentId}>
              <td>
                <Link href={`/documents/${d.documentId}`}><strong>{d.documentName}</strong></Link>
                <div className="small muted">
                  {d.documentNumber ?? 'Tanpa nomor'} · v{d.version}{d.divisionName ? ` · ${d.divisionName}` : ''}
                </div>
              </td>
              <td>{d.categoryName ?? '—'}</td>
              <td><LevelBadge level={d.securityLevel} /></td>
              <td>{d.picName ?? <span className="muted">—</span>}</td>
              <td><StatusBadge status={d.status} /></td>
              <td><ExpiryBadge date={d.expiryDate} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
