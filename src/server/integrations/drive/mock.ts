import { db } from '../../db'
import { DriveNotFoundError, type DriveAdapter, type DriveFile } from './types'

/**
 * Adapter Drive PENGEMBANGAN: isi "folder" dibaca dari tabel dev_drive_files.
 * Dipakai bila DRIVE_PROVIDER=mock (lokal, test, smoke). Container ID diawali "mock-".
 */
type Row = { file_id: string; name: string; mime_type: string; modified_at: Date; text_content: string | null; content: Buffer | null }

let failMode: null | 'AUTH' | 'UNAVAILABLE' = null
/** Untuk test/smoke: paksa adapter gagal. */
export function setMockDriveFailure(mode: null | 'AUTH' | 'UNAVAILABLE') {
  failMode = mode
}
async function checkFail() {
  const mode = failMode ?? (process.env.MOCK_DRIVE_FAIL as 'AUTH' | 'UNAVAILABLE' | undefined) ?? (await dbFailMode())
  if (mode === 'AUTH') {
    const { DriveAuthError } = await import('./types')
    throw new DriveAuthError('Otorisasi Google Drive dicabut atau kedaluwarsa.')
  }
  if (mode === 'UNAVAILABLE') {
    const { DriveUnavailableError } = await import('./types')
    throw new DriveUnavailableError('Google Drive tidak dapat dijangkau.')
  }
}
/** Mode gagal juga bisa diatur dari DB (dev_drive_files berisi baris khusus) — memudahkan smoke test lintas proses. */
async function dbFailMode(): Promise<null | 'AUTH' | 'UNAVAILABLE'> {
  const [r] = await db()<{ name: string }[]>`select name from dev_drive_files where file_id = '__FAIL_MODE__'`
  return (r?.name as 'AUTH' | 'UNAVAILABLE' | undefined) ?? null
}

export const mockDriveAdapter: DriveAdapter = {
  name: 'mock',
  accountLabel: () => 'csse-mock@drive.local',
  isConfigured: () => true,

  async getContainerInfo(c) {
    await checkFail()
    if (!c.externalId.startsWith('mock-')) throw new DriveNotFoundError('Folder tidak ditemukan atau belum dibagikan ke akun CSSE.')
    const [shared] = await db()<{ name: string }[]>`select name from dev_drive_files where file_id = ${`__SHARED__${c.externalId}`}`
    return { name: `Folder ${c.externalId}`, sharedWith: shared ? shared.name.split(',') : [] }
  },

  async listFiles(c) {
    await checkFail()
    const rows = await db()<Row[]>`
      select file_id, name, mime_type, modified_at, text_content, content from dev_drive_files
      where container_id = ${c.externalId} and not trashed and file_id not like '\\_\\_%' order by name`
    return rows.map(
      (r): DriveFile => ({
        id: r.file_id,
        name: r.name,
        mimeType: r.mime_type,
        modifiedTime: r.modified_at.toISOString(),
        webViewLink: `https://drive.google.com/file/d/${r.file_id}/view`,
        size: r.content?.length ?? r.text_content?.length ?? null,
        path: '',
      }),
    )
  },

  async extractText(file) {
    await checkFail()
    const [r] = await db()<Row[]>`select * from dev_drive_files where file_id = ${file.id}`
    return r?.text_content ?? null
  },

  async downloadFile(fileId) {
    await checkFail()
    const [r] = await db()<Row[]>`select * from dev_drive_files where file_id = ${fileId} and not trashed`
    if (!r) throw new DriveNotFoundError('File tidak ditemukan di Drive.')
    const isNative = r.mime_type.startsWith('application/vnd.google-apps.')
    const data = r.content ? new Uint8Array(r.content) : new TextEncoder().encode(r.text_content ?? '')
    return {
      data,
      mimeType: isNative ? 'application/pdf' : r.mime_type,
      fileName: isNative ? `${r.name}.pdf` : r.name,
    }
  },
}
