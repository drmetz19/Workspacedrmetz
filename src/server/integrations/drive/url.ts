/** Mengekstrak file ID Google Drive dari berbagai bentuk tautan (file, Docs, Sheets, Slides, open?id=). */
export function parseDriveFileId(input: string): string | null {
  const s = input.trim()
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s // sudah berupa ID
  let url: URL
  try {
    url = new URL(s)
  } catch {
    return null
  }
  if (!/(^|\.)google\.com$/.test(url.hostname)) return null
  const folder = url.pathname.match(/\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]+)/)
  if (folder) return folder[1]
  const m = url.pathname.match(/\/(?:file|document|spreadsheets|presentation|drawings|forms)\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)/)
  if (m) return m[1]
  const id = url.searchParams.get('id')
  if (id && /^[A-Za-z0-9_-]+$/.test(id)) return id
  return null
}

export const driveViewUrl = (fileId: string) => `https://drive.google.com/file/d/${fileId}/view`
