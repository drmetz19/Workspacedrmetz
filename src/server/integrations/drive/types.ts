/** Kontrak adapter penyimpanan file (Google Drive di MVP; storage lain kelak memakai kontrak yang sama). */
export interface DriveContainer {
  kind: 'FOLDER' | 'SHARED_DRIVE'
  externalId: string
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  webViewLink: string | null
  size: number | null
  /** Jalur relatif dari root folder yang terhubung, mis. "Izin/2026". */
  path: string
}

export interface DriveContainerInfo {
  name: string
  /** Email/principal lain yang punya akses (selain akun service CSSE). Untuk peringatan folder terbatas. */
  sharedWith: string[]
}

export interface DownloadedFile {
  data: Uint8Array
  mimeType: string
  fileName: string
}

export class DriveAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DriveAuthError'
  }
}

export class DriveUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DriveUnavailableError'
  }
}

export class DriveNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DriveNotFoundError'
  }
}

export interface DriveAdapter {
  readonly name: 'google' | 'mock'
  /** Identitas akun yang dipakai CSSE (untuk instruksi "bagikan folder ke …"). */
  accountLabel(): string
  isConfigured(): boolean
  getContainerInfo(c: DriveContainer): Promise<DriveContainerInfo>
  listFiles(c: DriveContainer): Promise<DriveFile[]>
  /** Teks yang bisa diekstrak (Google Docs/Sheets/Slides, PDF teks, txt). null bila tidak terbaca. */
  extractText(file: Pick<DriveFile, 'id' | 'mimeType' | 'name'>): Promise<string | null>
  /** Unduh isi file; file Google native diekspor ke PDF. */
  downloadFile(fileId: string): Promise<DownloadedFile>
}

export const GOOGLE_FOLDER_MIME = 'application/vnd.google-apps.folder'
export const isGoogleNative = (mime: string) => mime.startsWith('application/vnd.google-apps.') && mime !== GOOGLE_FOLDER_MIME

/** Mengekstrak ID folder / shared drive dari tautan Drive. */
export function parseDriveContainerId(input: string): string | null {
  const s = input.trim()
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s
  try {
    const u = new URL(s)
    if (!/(^|\.)google\.com$/.test(u.hostname)) return null
    const m = u.pathname.match(/\/(?:folders|drive\/u\/\d+\/folders)\/([A-Za-z0-9_-]+)/)
    if (m) return m[1]
    const id = u.searchParams.get('id')
    return id && /^[A-Za-z0-9_-]+$/.test(id) ? id : null
  } catch {
    return null
  }
}
