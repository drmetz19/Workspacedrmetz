export const ACTION_LABEL: Record<string, string> = {
  DOCUMENT_CREATED: 'Dokumen didaftarkan',
  DOCUMENT_UPDATED: 'Metadata diubah',
  DOCUMENT_ARCHIVED: 'Diarsipkan',
  DOCUMENT_SUPERSEDED: 'Digantikan versi baru',
  DOCUMENT_VERSION_LINKED: 'Ditautkan sebagai versi baru',
  DOCUMENT_VIEWED: 'Dilihat',
  DOCUMENT_OPENED: 'Dibuka',
  DOCUMENT_DOWNLOADED: 'Diunduh',
  ACCESS_DENIED: 'Akses ditolak',
  PERMISSION_CHANGED: 'Izin diubah',
  SECURITY_LEVEL_CHANGED: 'Level keamanan diubah',
  DOCUMENT_CONFIRMED: 'Draft dikonfirmasi',
  DOCUMENT_REJECTED: 'Draft ditolak',
  DOCUMENT_SOURCE_MISSING: 'File sumber hilang',
  APPROVAL_REQUESTED: 'Permintaan akses diajukan',
  ACCESS_APPROVED: 'Permintaan akses disetujui',
  ACCESS_REJECTED: 'Permintaan akses ditolak',
  ACCESS_EXPIRED: 'Akses sementara berakhir',
  OWNER_APPROVAL_FLAG_CHANGED: 'Tanda wajib persetujuan Owner diubah',
  APPROVAL_CANCELLED: 'Permintaan akses dibatalkan',
  DOCUMENT_SOURCE_RESTORED: 'File sumber ditemukan kembali',
  AI_DOCUMENT_QUERIED: 'Pertanyaan ke AI',
  LOGIN_SUCCEEDED: 'Login berhasil',
  LOGIN_FAILED: 'Login gagal',
  LOGIN_REJECTED: 'Login ditolak',
  ACCOUNT_LOCKED: 'Akun terkunci',
  LOGOUT: 'Keluar',
  PASSWORD_SET: 'Password diatur',
  PASSWORD_RESET_REQUESTED: 'Reset password diminta',
  USER_INVITED: 'User diundang',
  USER_UPDATED: 'User diubah',
  USER_DEACTIVATED: 'User dinonaktifkan',
  USER_REACTIVATED: 'User diaktifkan kembali',
  OWNER_BOOTSTRAPPED: 'Owner awal dibuat',
  ADMIN_PAGE_OPENED: 'Halaman admin dibuka',
  DIVISION_CREATED: 'Divisi dibuat',
  DIVISION_UPDATED: 'Divisi diubah',
  CATEGORY_CREATED: 'Kategori dibuat',
  CATEGORY_UPDATED: 'Kategori diubah',
  DRIVE_SOURCE_CONNECTED: 'Folder Drive dihubungkan',
  DRIVE_SOURCE_UPDATED: 'Sumber Drive diubah',
  DRIVE_SCAN_COMPLETED: 'Scan Drive selesai',
  DRIVE_SCAN_FAILED: 'Scan Drive gagal',
  AUDIT_VIEWED: 'Log audit dibuka',
  USERS_LISTED: 'Daftar user dibuka',
  DRIVE_SOURCES_LISTED: 'Daftar sumber Drive dibuka',
}

export const FIELD_LABEL: Record<string, string> = {
  documentName: 'Nama',
  documentNumber: 'Nomor',
  categoryId: 'Kategori',
  divisionId: 'Divisi',
  picUserId: 'PIC',
  externalUrl: 'Tautan Drive',
  effectiveDate: 'Tgl berlaku',
  expiryDate: 'Tgl kedaluwarsa',
  confirmedSummary: 'Ringkasan',
}

export function describePermissionChange(m: Record<string, unknown>): string {
  switch (m.kind) {
    case 'SECURITY_LEVEL':
      return `Level L${m.from} → L${m.to}`
    case 'OWNER_APPROVAL_REQUIRED':
      return m.to ? 'Wajib persetujuan Owner diaktifkan' : 'Wajib persetujuan Owner dimatikan'
    case 'GRANT':
      return `Izin ${m.permissionType} diberikan (${m.principalType})`
    case 'REVOKE':
      return `Izin ${m.permissionType} dicabut (${m.principalType})`
    default:
      return String(m.attempted ?? '')
  }
}
