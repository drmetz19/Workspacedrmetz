import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ServiceError } from '../errors'
import type { IdentityContext } from '../context'
import { parseInput } from '../validation'
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, storageAdapter } from '../integrations/storage'

const UploadRequest = z.object({
  fileName: z.string().trim().min(1, 'nama berkas wajib').max(200),
  mimeType: z.string().trim().min(1, 'jenis berkas wajib'),
  size: z.coerce.number().int().positive('berkas kosong'),
})

const allowedList = () => [...new Set(Object.values(ALLOWED_UPLOAD_TYPES))].join(', ')

/** Nama aman untuk path objek: huruf/angka/titik/minus/garis bawah saja. */
export function safeObjectName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^[._]+/, '')
  return (cleaned.slice(-100) || 'berkas').replace(/^[._]+/, '') || 'berkas'
}

/** Nama untuk ditampilkan (boleh spasi/huruf non-ASCII), tanpa karakter kontrol & pemisah path. */
export function displayFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f/\\]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || 'berkas'
}

function checkTypeAndSize(mimeType: string, size: number) {
  if (!ALLOWED_UPLOAD_TYPES[mimeType]) throw new ServiceError('VALIDATION', `Jenis berkas tidak didukung. Gunakan: ${allowedList()}.`)
  if (size > MAX_UPLOAD_BYTES) throw new ServiceError('VALIDATION', `Ukuran berkas maksimal ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`)
}

/**
 * Menyiapkan unggahan: memvalidasi jenis & ukuran, membuat path milik user ini, dan mengeluarkan URL unggah sekali pakai.
 * Browser mengunggah langsung ke penyimpanan (tidak lewat server CSSE → tidak terkena batas ukuran request).
 */
export async function prepareDocumentUpload(ctx: IdentityContext, input: unknown) {
  const data = parseInput(UploadRequest, input)
  checkTypeAndSize(data.mimeType, data.size)
  const path = `u/${ctx.userId}/${randomUUID()}/${safeObjectName(data.fileName)}`
  const { uploadUrl } = await storageAdapter().createSignedUpload(path)
  return { path, uploadUrl, fileName: displayFileName(data.fileName), maxBytes: MAX_UPLOAD_BYTES }
}

export interface VerifiedUpload {
  path: string
  fileName: string
  size: number
  mimeType: string
}

/**
 * Dipanggil saat dokumen disimpan: path harus milik user ini (tidak bisa menempelkan unggahan orang lain),
 * objeknya benar-benar ada, dan jenis/ukurannya diambil dari penyimpanan (bukan dari klaim browser).
 */
export async function verifyUploadedFile(ctx: IdentityContext, path: string, displayName?: string | null): Promise<VerifiedUpload> {
  const owned = new RegExp(`^u/${ctx.userId}/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$`)
  if (!owned.test(path)) throw new ServiceError('VALIDATION', 'uploadPath: berkas unggahan tidak valid. Unggah ulang berkasnya.')
  const info = await storageAdapter().objectInfo(path)
  if (!info) throw new ServiceError('VALIDATION', 'uploadPath: berkas belum selesai terunggah. Tunggu sampai unggahan 100% lalu simpan lagi.')
  checkTypeAndSize(info.mimeType, info.size)
  return { path, fileName: displayFileName(displayName || path.split('/').pop()!), size: info.size, mimeType: info.mimeType }
}
