import { db } from '../db'
import { auditAs } from '../audit'
import { ServiceError } from '../errors'
import { config } from '../config'
import type { IdentityContext } from '../context'
import { decide } from '../permissions/engine'
import { driveAdapter, DriveAuthError, DriveNotFoundError, DriveUnavailableError } from '../integrations/drive'
import { facts, loadVisibleDocumentWithGrants } from './documents'
import { autoRequestOwnerApproval } from './access'

/** Tipe yang aman ditampilkan inline di origin CSSE; selain itu dipaksa unduh (mencegah HTML/JS berjalan di origin app). */
const INLINE_SAFE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain'])

export interface AuthorizedFile {
  data: Uint8Array
  mimeType: string
  fileName: string
  disposition: 'inline' | 'attachment'
}

/**
 * get_authorized_document — satu-satunya jalan membuka file L3–5 (juga berlaku untuk L1–2).
 * Izin diperiksa engine, file diambil oleh akun service CSSE (user tidak butuh akses Drive), setiap akses diaudit.
 */
export async function getAuthorizedDocument(ctx: IdentityContext, documentId: unknown, opts: { download?: boolean } = {}): Promise<AuthorizedFile> {
  const action = opts.download ? 'DOCUMENT_DOWNLOADED' : 'DOCUMENT_OPENED'
  const { row, grants } = await loadVisibleDocumentWithGrants(ctx, documentId, action)
  const dec = decide(ctx, facts(row), 'OPEN', grants)
  if (!dec.allowed) {
    await auditAs(ctx, { action: 'ACCESS_DENIED', resourceType: 'DOCUMENT', resourceId: row.document_id, result: 'DENIED', metadata: { attempted: action, reason: dec.reason } })
    if (dec.reason === 'OWNER_APPROVAL_REQUIRED') {
      const req = await autoRequestOwnerApproval(ctx, row, 'OPEN')
      throw new ServiceError('ACCESS_DENIED', 'Dokumen ini wajib persetujuan Owner. Permintaan persetujuan sudah dikirim ke Owner.', { requestId: req.requestId, autoRequested: true })
    }
    throw new ServiceError('ACCESS_DENIED', dec.requestable ? 'Akses ditolak. Ajukan permintaan akses untuk membuka dokumen ini.' : 'Akses ditolak.', {
      requestable: dec.requestable, reason: dec.reason,
    })
  }
  if (config.driveMode === 'link')
    throw new ServiceError('VALIDATION', 'Mode tautan Drive aktif: buka dokumen lewat tautan Google Drive-nya.')
  if (!row.external_resource_id) throw new ServiceError('NOT_FOUND', 'Dokumen ini belum memiliki file di Google Drive.')
  let file
  try {
    file = await driveAdapter().downloadFile(row.external_resource_id)
  } catch (e) {
    const reason = e instanceof DriveNotFoundError ? 'NOT_FOUND' : e instanceof DriveAuthError ? 'AUTH' : 'UNAVAILABLE'
    await auditAs(ctx, { action, resourceType: 'DOCUMENT', resourceId: row.document_id, result: 'FAILED', metadata: { reason } })
    if (e instanceof DriveNotFoundError) {
      await db()`update documents set flag_source_missing = true where document_id = ${row.document_id}`
      throw new ServiceError('NOT_FOUND', 'File tidak ditemukan di Google Drive (mungkin dipindah atau dihapus). Hubungi PIC dokumen.')
    }
    if (e instanceof DriveAuthError || e instanceof DriveUnavailableError)
      throw new ServiceError('UNAVAILABLE', 'Google Drive sedang tidak dapat dijangkau. Metadata tetap bisa dilihat; coba buka file beberapa saat lagi.')
    throw e
  }
  await auditAs(ctx, {
    action, resourceType: 'DOCUMENT', resourceId: row.document_id, result: 'SUCCESS',
    metadata: { securityLevel: row.security_level, via: 'CSSE_PROXY', grant: dec.reason === 'EXPLICIT_GRANT' },
  })
  const inline = !opts.download && INLINE_SAFE.has(file.mimeType)
  return { ...file, disposition: inline ? 'inline' : 'attachment' }
}

/** Membuka dokumen L1–2 di Google Drive lewat CSSE agar tercatat (DOCUMENT_OPENED via DRIVE_LINK). */
export async function openDriveLink(ctx: IdentityContext, documentId: unknown): Promise<string> {
  const { row, grants } = await loadVisibleDocumentWithGrants(ctx, documentId, 'DOCUMENT_OPENED')
  const dec = decide(ctx, facts(row), 'OPEN', grants)
  const linkMode = config.driveMode === 'link'
  if (!dec.allowed || (!linkMode && row.security_level >= 3) || !row.external_url) {
    await auditAs(ctx, { action: 'ACCESS_DENIED', resourceType: 'DOCUMENT', resourceId: row.document_id, result: 'DENIED', metadata: { attempted: 'DOCUMENT_OPENED', via: 'DRIVE_LINK' } })
    throw new ServiceError('ACCESS_DENIED', row.security_level >= 3 ? 'Dokumen terbatas hanya dapat dibuka lewat CSSE.' : 'Akses ditolak.')
  }
  await auditAs(ctx, { action: 'DOCUMENT_OPENED', resourceType: 'DOCUMENT', resourceId: row.document_id, result: 'SUCCESS', metadata: { securityLevel: row.security_level, via: 'DRIVE_LINK' } })
  return row.external_url
}
