import { createSign } from 'node:crypto'
import { DriveAuthError, DriveNotFoundError, DriveUnavailableError, GOOGLE_FOLDER_MIME, isGoogleNative, type DriveAdapter, type DriveFile } from './types'

/**
 * Adapter Google Drive API v3 memakai akun service (opsional: domain-wide delegation via GOOGLE_IMPERSONATE_SUBJECT).
 * Akses read-only. Env:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — isi JSON key (boleh base64)
 *   GOOGLE_IMPERSONATE_SUBJECT   — email user Workspace yang diimpersonasi (opsional)
 */
interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

const API = 'https://www.googleapis.com/drive/v3'
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
  return JSON.parse(json) as ServiceAccount
}

let cached: { token: string; exp: number } | null = null

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token
  const sa = serviceAccount()
  if (!sa) throw new DriveAuthError('Akun service Google Drive belum dikonfigurasi.')
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const claims: Record<string, unknown> = { iss: sa.client_email, scope: SCOPE, aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }
  if (process.env.GOOGLE_IMPERSONATE_SUBJECT) claims.sub = process.env.GOOGLE_IMPERSONATE_SUBJECT
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(sa.private_key, 'base64url')
  const res = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${payload}.${signature}` }),
  }).catch(() => {
    throw new DriveUnavailableError('Google tidak dapat dijangkau.')
  })
  if (!res.ok) throw new DriveAuthError(`Otorisasi Google Drive gagal (${res.status}).`)
  const body = (await res.json()) as { access_token: string; expires_in: number }
  cached = { token: body.access_token, exp: Date.now() + body.expires_in * 1000 }
  return cached.token
}

async function api(path: string, params: Record<string, string> = {}, raw = false): Promise<Response> {
  const url = new URL(API + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('supportsAllDrives', 'true')
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } }).catch(() => {
    throw new DriveUnavailableError('Google Drive tidak dapat dijangkau.')
  })
  if (res.status === 401 || res.status === 403) {
    cached = null
    throw new DriveAuthError('Akses Google Drive ditolak. Periksa izin akun service.')
  }
  if (res.status === 404) throw new DriveNotFoundError('File/folder tidak ditemukan atau belum dibagikan ke akun CSSE.')
  if (!res.ok) throw new DriveUnavailableError(`Google Drive error ${res.status}.`)
  return raw ? res : res
}

type ApiFile = { id: string; name: string; mimeType: string; modifiedTime: string; webViewLink?: string; size?: string }

export const googleDriveAdapter: DriveAdapter = {
  name: 'google',
  accountLabel: () => serviceAccount()?.client_email ?? '(akun service belum di-set)',
  isConfigured: () => !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON,

  async getContainerInfo(c) {
    if (c.kind === 'SHARED_DRIVE') {
      const d = (await (await api(`/drives/${c.externalId}`)).json()) as { name: string }
      return { name: d.name, sharedWith: await listPrincipals(c.externalId) }
    }
    const f = (await (await api(`/files/${c.externalId}`, { fields: 'id,name,mimeType' })).json()) as ApiFile
    if (f.mimeType !== GOOGLE_FOLDER_MIME) throw new DriveNotFoundError('ID tersebut bukan folder.')
    return { name: f.name, sharedWith: await listPrincipals(c.externalId) }
  },

  async listFiles(c) {
    const out: DriveFile[] = []
    const queue: { id: string; path: string }[] = [{ id: c.externalId, path: '' }]
    while (queue.length) {
      const folder = queue.shift()!
      let pageToken = ''
      do {
        const params: Record<string, string> = {
          q: `'${folder.id}' in parents and trashed = false`,
          fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,webViewLink,size)',
          pageSize: '1000',
          includeItemsFromAllDrives: 'true',
        }
        if (pageToken) params.pageToken = pageToken
        const body = (await (await api('/files', params)).json()) as { files: ApiFile[]; nextPageToken?: string }
        for (const f of body.files) {
          if (f.mimeType === GOOGLE_FOLDER_MIME) queue.push({ id: f.id, path: folder.path ? `${folder.path}/${f.name}` : f.name })
          else out.push({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, webViewLink: f.webViewLink ?? null, size: f.size ? Number(f.size) : null, path: folder.path })
        }
        pageToken = body.nextPageToken ?? ''
      } while (pageToken)
    }
    return out
  },

  async extractText(file) {
    if (isGoogleNative(file.mimeType)) {
      const exportMime = file.mimeType === 'application/vnd.google-apps.spreadsheet' ? 'text/csv' : 'text/plain'
      const res = await api(`/files/${file.id}/export`, { mimeType: exportMime }, true)
      return (await res.text()).slice(0, 200_000)
    }
    if (file.mimeType.startsWith('text/')) return (await (await api(`/files/${file.id}`, { alt: 'media' }, true)).text()).slice(0, 200_000)
    if (file.mimeType === 'application/pdf') {
      const res = await api(`/files/${file.id}`, { alt: 'media' }, true)
      const { extractPdfText } = await import('./pdf-text')
      return extractPdfText(new Uint8Array(await res.arrayBuffer()))
    }
    return null
  },

  async downloadFile(fileId) {
    const meta = (await (await api(`/files/${fileId}`, { fields: 'id,name,mimeType' })).json()) as ApiFile
    if (isGoogleNative(meta.mimeType)) {
      const res = await api(`/files/${fileId}/export`, { mimeType: 'application/pdf' }, true)
      return { data: new Uint8Array(await res.arrayBuffer()), mimeType: 'application/pdf', fileName: `${meta.name}.pdf` }
    }
    const res = await api(`/files/${fileId}`, { alt: 'media' }, true)
    return { data: new Uint8Array(await res.arrayBuffer()), mimeType: meta.mimeType, fileName: meta.name }
  },
}

async function listPrincipals(id: string): Promise<string[]> {
  try {
    const body = (await (await api(`/files/${id}/permissions`, { fields: 'permissions(emailAddress,domain,type,role)' })).json()) as {
      permissions: { emailAddress?: string; domain?: string; type: string }[]
    }
    const self = serviceAccount()?.client_email
    return body.permissions
      .map((p) => p.emailAddress ?? (p.type === 'anyone' ? 'SIAPA SAJA DENGAN LINK' : p.domain ? `domain:${p.domain}` : p.type))
      .filter((e) => e && e !== self)
  } catch {
    return []
  }
}
