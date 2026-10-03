import { config } from '../../config'
import { ServiceError } from '../../errors'

/**
 * Penyimpanan berkas dokumen yang diunggah (Supabase Storage, bucket privat).
 * Hanya server CSSE yang memegang service role key; browser hanya menerima URL bertanda tangan
 * berumur pendek yang dikeluarkan SETELAH izin diperiksa.
 */
export const STORAGE_BUCKET = 'csse-documents'
export { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from '../../../lib/upload-types'

export interface StoredObjectInfo {
  size: number
  mimeType: string
}

export interface StorageAdapter {
  /** URL relatif/absolut untuk PUT langsung dari browser (sekali pakai). */
  createSignedUpload(path: string): Promise<{ uploadUrl: string }>
  /** null bila objek tidak ada. */
  objectInfo(path: string): Promise<StoredObjectInfo | null>
  /** URL unduh/tampil bertanda tangan. downloadName terisi → browser mengunduh dengan nama itu. */
  createSignedDownload(path: string, opts: { expiresIn: number; downloadName?: string }): Promise<string | null>
}

export const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

function supabaseBase() {
  const url = config.supabase.url.replace(/\/$/, '')
  const key = config.supabase.serviceRoleKey
  if (!url || !key) throw new ServiceError('UNAVAILABLE', 'Penyimpanan berkas belum dikonfigurasi (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).')
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}` } }
}

async function storageFetch(path: string, init: RequestInit = {}) {
  const { url, headers } = supabaseBase()
  try {
    return await fetch(`${url}/storage/v1${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) }, cache: 'no-store' })
  } catch {
    throw new ServiceError('UNAVAILABLE', 'Penyimpanan berkas sedang tidak dapat dijangkau. Coba lagi beberapa saat.')
  }
}

export const supabaseStorageAdapter: StorageAdapter = {
  async createSignedUpload(path) {
    const res = await storageFetch(`/object/upload/sign/${STORAGE_BUCKET}/${encodePath(path)}`, { method: 'POST' })
    if (!res.ok) throw new ServiceError('UNAVAILABLE', 'Gagal menyiapkan unggahan berkas. Coba lagi.')
    const body = (await res.json()) as { url?: string }
    if (!body.url) throw new ServiceError('UNAVAILABLE', 'Gagal menyiapkan unggahan berkas. Coba lagi.')
    return { uploadUrl: `${supabaseBase().url}/storage/v1${body.url}` }
  },

  async objectInfo(path) {
    const res = await storageFetch(`/object/${STORAGE_BUCKET}/${encodePath(path)}`, { method: 'HEAD' })
    if (res.status === 400 || res.status === 404) return null
    if (!res.ok) throw new ServiceError('UNAVAILABLE', 'Penyimpanan berkas sedang tidak dapat dijangkau.')
    return {
      size: Number(res.headers.get('content-length') ?? 0),
      mimeType: (res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim(),
    }
  },

  async createSignedDownload(path, opts) {
    const res = await storageFetch(`/object/sign/${STORAGE_BUCKET}/${encodePath(path)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: opts.expiresIn }),
    })
    if (res.status === 400 || res.status === 404) return null
    if (!res.ok) throw new ServiceError('UNAVAILABLE', 'Penyimpanan berkas sedang tidak dapat dijangkau.')
    const body = (await res.json()) as { signedURL?: string }
    if (!body.signedURL) return null
    const u = new URL(`${supabaseBase().url}/storage/v1${body.signedURL}`)
    if (opts.downloadName) u.searchParams.set('download', opts.downloadName)
    return u.toString()
  },
}

// ── Mock (test/pengembangan) ───────────────────────────────────────────
const mockObjects = new Map<string, StoredObjectInfo>()

export const mockStorageAdapter: StorageAdapter & { put(path: string, info: StoredObjectInfo): void; reset(): void } = {
  async createSignedUpload(path) {
    return { uploadUrl: `https://storage.mock/upload/${encodePath(path)}?token=mock` }
  },
  async objectInfo(path) {
    return mockObjects.get(path) ?? null
  },
  async createSignedDownload(path, opts) {
    if (!mockObjects.has(path)) return null
    return `https://storage.mock/sign/${encodePath(path)}?token=mock&expires=${opts.expiresIn}${opts.downloadName ? `&download=${encodeURIComponent(opts.downloadName)}` : ''}`
  },
  put(path, info) {
    mockObjects.set(path, info)
  },
  reset() {
    mockObjects.clear()
  },
}

let override: StorageAdapter | null = null

export function storageAdapter(): StorageAdapter {
  return override ?? supabaseStorageAdapter
}

export function setStorageAdapterForTest(a: StorageAdapter | null) {
  override = a
}
