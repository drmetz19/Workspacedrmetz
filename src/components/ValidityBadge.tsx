import type { DocumentDto } from '@/server/services/documents'
import { daysUntil } from './Badges'
import { fmtDate } from '@/lib/labels'

/** Masa berlaku & status dalam bahasa sehari-hari (kolom "Masa berlaku / status"). */
export function ValidityBadge({ doc }: { doc: { status: string; expiryDate: Pick<DocumentDto, 'expiryDate'>['expiryDate'] } }) {
  if (doc.status === 'SUPERSEDED') return <span className="badge badge-muted">Diganti versi baru</span>
  if (doc.status === 'ARCHIVED') return <span className="badge badge-muted">Arsip</span>
  const d = daysUntil(doc.expiryDate)
  if (d === null) return <span className="badge badge-ok"><span className="dot ok" /> Aktif</span>
  if (d < 0) return <span className="badge badge-danger" title={`Berakhir ${fmtDate(doc.expiryDate)}`}>Kedaluwarsa {-d} hari lalu</span>
  if (d === 0) return <span className="badge badge-danger">Berakhir hari ini</span>
  if (d <= 30) return <span className="badge badge-danger" title={`Berakhir ${fmtDate(doc.expiryDate)}`}>Berakhir {d} hari lagi</span>
  if (d <= 90) return <span className="badge badge-warn" title={`Berakhir ${fmtDate(doc.expiryDate)}`}>Berakhir {d} hari lagi</span>
  return <span className="badge badge-ok" title={`${d} hari lagi`}>Berlaku s.d. {fmtDate(doc.expiryDate)}</span>
}
