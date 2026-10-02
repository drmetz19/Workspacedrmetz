export const LEVEL_NAME: Record<number, string> = {
  1: 'Internal',
  2: 'Controlled',
  3: 'Confidential',
  4: 'Restricted',
  5: 'Executive',
}

export function LevelBadge({ level }: { level: number }) {
  return <span className={`lvl lvl-${level}`} title={`Level ${level} — ${LEVEL_NAME[level]}`}>L{level} · {LEVEL_NAME[level]}</span>
}

const STATUS: Record<string, [string, string]> = {
  DRAFT: ['Draft', 'badge-warn'],
  ACTIVE: ['Aktif', 'badge-ok'],
  SUPERSEDED: ['Tidak berlaku', 'badge-muted'],
  ARCHIVED: ['Arsip', 'badge-muted'],
}

export function StatusBadge({ status }: { status: string }) {
  const [label, cls] = STATUS[status] ?? [status, 'badge-muted']
  return <span className={`badge ${cls}`}>{label}</span>
}

/** Hari menuju kedaluwarsa (negatif = lewat). */
export function daysUntil(date: string | null) {
  if (!date) return null
  const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }))
  return Math.round((new Date(date).getTime() - today.getTime()) / 86_400_000)
}

export function ExpiryBadge({ date }: { date: string | null }) {
  const d = daysUntil(date)
  if (d === null) return <span className="muted">—</span>
  const label = new Date(date!).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
  if (d < 0) return <span className="badge badge-danger" title={`Lewat ${-d} hari`}>{label} · lewat</span>
  if (d <= 90) return <span className="badge badge-warn" title={`${d} hari lagi`}>{label} · {d} hr</span>
  return <span>{label}</span>
}
