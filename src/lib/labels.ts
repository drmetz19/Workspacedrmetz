export const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  GM: 'General Manager',
  DIVISION_USER: 'Division User',
}

export const USER_STATUS_LABEL: Record<string, string> = {
  INVITED: 'Diundang',
  ACTIVE: 'Aktif',
  DEACTIVATED: 'Nonaktif',
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })
}

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
}
