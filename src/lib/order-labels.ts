export const ORDER_STATUS: Record<string, [string, string]> = {
  MENUNGGU: ['Menunggu PSCM', 'badge-warn'],
  DISETUJUI: ['Disetujui', 'badge-ok'],
  DITOLAK: ['Ditolak', 'badge-danger'],
  SEBAGIAN_DITERIMA: ['Sebagian diterima', 'badge-sky'],
  DITERIMA: ['Diterima lengkap', 'badge-ok'],
  DIBATALKAN: ['Dibatalkan', 'badge-muted'],
}

export const ORDER_SOURCE: Record<string, string> = { FORM_PUBLIK: 'Formulir cabang', APLIKASI: 'Aplikasi' }
export const DIRECTION_LABEL: Record<string, string> = { MASUK: 'Barang masuk (diterima)', KELUAR: 'Barang keluar (dikirim)' }

export const fmtQty = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n)
