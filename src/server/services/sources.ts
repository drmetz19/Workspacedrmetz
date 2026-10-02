import { z } from 'zod'
import { db } from '../db'
import { auditAs, recordAudit } from '../audit'
import { ServiceError } from '../errors'
import type { IdentityContext } from '../context'
import { requireOwner } from '../guards'
import { optionalUuid, parseInput, requireUuid } from '../validation'
import {
  driveAdapter,
  DriveAuthError,
  DriveNotFoundError,
  DriveUnavailableError,
  parseDriveContainerId,
  type DriveContainer,
  type DriveFile,
} from '../integrations/drive'
import { suggestFromFilename } from './suggest'
import { enrichSuggestion } from './suggest-ai'

export interface DriveSourceDto {
  sourceId: string
  name: string
  containerKind: 'FOLDER' | 'SHARED_DRIVE'
  externalId: string
  externalUrl: string | null
  sourceType: 'STANDARD' | 'RESTRICTED'
  defaultDivisionId: string | null
  defaultDivisionName: string | null
  status: 'ACTIVE' | 'DISABLED'
  authStatus: 'UNKNOWN' | 'OK' | 'ERROR'
  lastScanAt: Date | null
  lastScanStatus: 'OK' | 'ERROR' | null
  lastScanError: string | null
  lastScanStats: ScanStats | Record<string, never>
  sharedWith: string[]
  documentCount: number
}

export interface ScanStats {
  found: number
  created: number
  skipped: number
  linked: number
  missing: number
  restored: number
}

type SourceRow = {
  source_id: string; name: string; container_kind: 'FOLDER' | 'SHARED_DRIVE'; external_id: string; external_url: string | null
  source_type: 'STANDARD' | 'RESTRICTED'; default_division_id: string | null; division_name?: string | null; status: 'ACTIVE' | 'DISABLED'
  auth_status: 'UNKNOWN' | 'OK' | 'ERROR'; last_scan_at: Date | null; last_scan_status: 'OK' | 'ERROR' | null; last_scan_error: string | null
  last_scan_stats: ScanStats; shared_with: string[]; document_count?: number
}

const toDto = (r: SourceRow): DriveSourceDto => ({
  sourceId: r.source_id, name: r.name, containerKind: r.container_kind, externalId: r.external_id, externalUrl: r.external_url,
  sourceType: r.source_type, defaultDivisionId: r.default_division_id, defaultDivisionName: r.division_name ?? null, status: r.status,
  authStatus: r.auth_status, lastScanAt: r.last_scan_at, lastScanStatus: r.last_scan_status, lastScanError: r.last_scan_error,
  lastScanStats: r.last_scan_stats ?? {}, sharedWith: r.shared_with ?? [], documentCount: r.document_count ?? 0,
})

const container = (r: Pick<SourceRow, 'container_kind' | 'external_id'>): DriveContainer => ({ kind: r.container_kind, externalId: r.external_id })

function requireOwnerOrGm(ctx: IdentityContext, action: string) {
  if (ctx.roleId === 'OWNER' || ctx.roleId === 'GM') return Promise.resolve()
  return requireOwner(ctx, action, 'DRIVE_SOURCE')
}

// ── Sumber Drive ────────────────────────────────────────────────────────
const SourceInput = z.object({
  name: z.string().trim().max(120).nullish(),
  folder: z.string().trim().min(5, 'isi tautan atau ID folder Google Drive'),
  containerKind: z.enum(['FOLDER', 'SHARED_DRIVE']).default('FOLDER'),
  sourceType: z.enum(['STANDARD', 'RESTRICTED']),
  defaultDivisionId: optionalUuid,
})

export async function createDriveSource(ctx: IdentityContext, input: unknown): Promise<DriveSourceDto> {
  await requireOwner(ctx, 'DRIVE_SOURCE_CONNECTED', 'DRIVE_SOURCE')
  const data = parseInput(SourceInput, input)
  const externalId = parseDriveContainerId(data.folder)
  if (!externalId) throw new ServiceError('VALIDATION', 'folder: bukan tautan/ID folder Google Drive yang dikenali')
  if ((await db()`select 1 from drive_sources where external_id = ${externalId}`).length)
    throw new ServiceError('CONFLICT', 'Folder ini sudah terhubung.')
  const adapter = driveAdapter()
  if (!adapter.isConfigured()) throw new ServiceError('UNAVAILABLE', 'Koneksi Google Drive belum dikonfigurasi (akun service).')
  let info
  try {
    info = await adapter.getContainerInfo({ kind: data.containerKind, externalId })
  } catch (e) {
    if (e instanceof DriveNotFoundError || e instanceof DriveAuthError)
      throw new ServiceError('VALIDATION', `CSSE tidak bisa mengakses folder ini. Bagikan folder ke ${adapter.accountLabel()} (Viewer), lalu coba lagi.`)
    if (e instanceof DriveUnavailableError) throw new ServiceError('UNAVAILABLE', 'Google Drive tidak dapat dijangkau. Coba lagi nanti.')
    throw e
  }
  const url = data.containerKind === 'SHARED_DRIVE' ? `https://drive.google.com/drive/folders/${externalId}` : `https://drive.google.com/drive/folders/${externalId}`
  const id = await db().begin(async (tx) => {
    const [r] = await tx<{ source_id: string }[]>`
      insert into drive_sources (name, container_kind, external_id, external_url, source_type, default_division_id, auth_status, shared_with, created_by)
      values (${data.name || info.name}, ${data.containerKind}, ${externalId}, ${url}, ${data.sourceType}, ${data.defaultDivisionId}, 'OK',
              ${tx.json(info.sharedWith)}, ${ctx.userId})
      returning source_id`
    await auditAs(ctx, { action: 'DRIVE_SOURCE_CONNECTED', resourceType: 'DRIVE_SOURCE', resourceId: r.source_id, result: 'SUCCESS', metadata: { externalId, sourceType: data.sourceType, sharedWith: info.sharedWith } }, tx)
    return r.source_id
  })
  return (await getSource(id))!
}

async function getSource(id: string): Promise<DriveSourceDto | null> {
  const [r] = await db()<SourceRow[]>`
    select s.*, d.division_name, (select count(*)::int from documents x where x.source_id = s.source_id) as document_count
    from drive_sources s left join divisions d on d.division_id = s.default_division_id where s.source_id = ${id}`
  return r ? toDto(r) : null
}

export async function listDriveSources(ctx: IdentityContext): Promise<DriveSourceDto[]> {
  await requireOwnerOrGm(ctx, 'DRIVE_SOURCES_LISTED')
  const rows = await db()<SourceRow[]>`
    select s.*, d.division_name, (select count(*)::int from documents x where x.source_id = s.source_id) as document_count
    from drive_sources s left join divisions d on d.division_id = s.default_division_id order by s.created_at`
  return rows.map(toDto)
}

export async function setDriveSourceStatus(ctx: IdentityContext, sourceId: unknown, status: unknown) {
  await requireOwner(ctx, 'DRIVE_SOURCE_UPDATED', 'DRIVE_SOURCE', typeof sourceId === 'string' ? sourceId : null)
  const id = requireUuid(sourceId, 'Sumber')
  const s = parseInput(z.enum(['ACTIVE', 'DISABLED']), status)
  const rows = await db()`update drive_sources set status = ${s}, updated_at = now() where source_id = ${id} returning 1`
  if (!rows.length) throw new ServiceError('NOT_FOUND', 'Sumber tidak ditemukan.')
  await auditAs(ctx, { action: 'DRIVE_SOURCE_UPDATED', resourceType: 'DRIVE_SOURCE', resourceId: id, result: 'SUCCESS', metadata: { status: s } })
}

/** Status koneksi Drive untuk topbar & dashboard. */
export async function driveHealth() {
  const rows = await db()<{ status: string; auth_status: string; last_scan_status: string | null; name: string; last_scan_error: string | null }[]>`
    select status, auth_status, last_scan_status, name, last_scan_error from drive_sources where status = 'ACTIVE'`
  const configured = driveAdapter().isConfigured()
  const errors = rows.filter((r) => r.auth_status === 'ERROR')
  return {
    configured,
    sources: rows.length,
    connected: configured && rows.length > 0 && errors.length === 0,
    authErrors: errors.map((r) => ({ name: r.name, error: r.last_scan_error })),
  }
}

// ── Scan ────────────────────────────────────────────────────────────────
type Actor = IdentityContext | null

function audit(actor: Actor, e: Parameters<typeof recordAudit>[0]) {
  return actor ? auditAs(actor, e) : recordAudit({ ...e, source: 'SYSTEM' })
}

export async function scanSource(actor: Actor, sourceId: unknown): Promise<ScanStats> {
  if (actor) await requireOwnerOrGm(actor, 'DRIVE_SCAN_COMPLETED')
  const id = requireUuid(sourceId, 'Sumber')
  const [src] = await db()<SourceRow[]>`select * from drive_sources where source_id = ${id}`
  if (!src) throw new ServiceError('NOT_FOUND', 'Sumber tidak ditemukan.')
  if (src.status !== 'ACTIVE') throw new ServiceError('VALIDATION', 'Sumber dinonaktifkan.')

  const adapter = driveAdapter()
  let files: DriveFile[]
  try {
    files = await adapter.listFiles(container(src))
  } catch (e) {
    const auth = e instanceof DriveAuthError
    const msg = e instanceof Error ? e.message : 'Gagal membaca Drive'
    await db()`update drive_sources set last_scan_at = now(), last_scan_status = 'ERROR', last_scan_error = ${msg},
      auth_status = ${auth ? 'ERROR' : src.auth_status}, updated_at = now() where source_id = ${id}`
    await audit(actor, { action: 'DRIVE_SCAN_FAILED', resourceType: 'DRIVE_SOURCE', resourceId: id, result: 'FAILED', metadata: { error: msg, auth } })
    if (auth || e instanceof DriveUnavailableError || e instanceof DriveNotFoundError) {
      throw new ServiceError('UNAVAILABLE', auth ? `Otorisasi Google Drive bermasalah: ${msg}` : msg)
    }
    throw e
  }

  const restricted = src.source_type === 'RESTRICTED'
  const ids = files.map((f) => f.id)
  const existing = await db()<{ document_id: string; external_resource_id: string; source_id: string | null; flag_source_missing: boolean }[]>`
    select document_id, external_resource_id, source_id, flag_source_missing from documents
    where external_provider = 'GOOGLE_DRIVE' and external_resource_id = any(${ids}::text[])`
  const known = new Map(existing.map((e) => [e.external_resource_id, e]))
  const stats: ScanStats = { found: files.length, created: 0, skipped: 0, linked: 0, missing: 0, restored: 0 }

  for (const file of files) {
    const doc = known.get(file.id)
    if (doc) {
      stats.skipped++
      if (!doc.source_id) {
        await db()`update documents set source_id = ${id} where document_id = ${doc.document_id}`
        stats.linked++
      }
      if (doc.flag_source_missing && (doc.source_id === id || !doc.source_id)) {
        await db()`update documents set flag_source_missing = false, updated_at = now() where document_id = ${doc.document_id}`
        await audit(actor, { action: 'DOCUMENT_SOURCE_RESTORED', resourceType: 'DOCUMENT', resourceId: doc.document_id, result: 'SUCCESS' })
        stats.restored++
      }
      continue
    }
    await createDraftFromFile(actor, src, file, restricted)
    stats.created++
  }

  // File yang sudah terdaftar dari sumber ini tapi tidak ada lagi → tandai "sumber hilang" (tidak dihapus).
  const gone = await db()<{ document_id: string }[]>`
    update documents set flag_source_missing = true, updated_at = now()
    where source_id = ${id} and not flag_source_missing and not (external_resource_id = any(${ids}::text[]))
    returning document_id`
  for (const g of gone) {
    await audit(actor, { action: 'DOCUMENT_SOURCE_MISSING', resourceType: 'DOCUMENT', resourceId: g.document_id, result: 'SUCCESS', metadata: { sourceId: id } })
  }
  stats.missing = gone.length

  await db()`update drive_sources set last_scan_at = now(), last_scan_status = 'OK', last_scan_error = null, auth_status = 'OK',
    last_scan_stats = ${db().json(stats as never)}, updated_at = now() where source_id = ${id}`
  await audit(actor, { action: 'DRIVE_SCAN_COMPLETED', resourceType: 'DRIVE_SOURCE', resourceId: id, result: 'SUCCESS', metadata: { ...stats } })
  return stats
}

async function createDraftFromFile(actor: Actor, src: SourceRow, file: DriveFile, restricted: boolean) {
  const heuristic = suggestFromFilename(file, restricted)
  const [doc] = await db()<{ document_id: string }[]>`
    insert into documents (external_resource_id, external_url, document_name, division_id, security_level, status, source_id,
      external_modified_at, external_mime_type, owner_user_id, created_by)
    values (${file.id}, ${file.webViewLink}, ${heuristic.documentName ?? file.name}, ${src.default_division_id}, ${restricted ? 3 : 2}, 'DRAFT', ${src.source_id},
      ${file.modifiedTime}, ${file.mimeType}, ${actor?.userId ?? null}, ${actor?.userId ?? null})
    on conflict do nothing
    returning document_id`
  if (!doc) return
  await db()`insert into document_suggestions (document_id, source, provider, input_scope, fields)
             values (${doc.document_id}, 'HEURISTIC', 'filename', 'FILENAME_METADATA', ${db().json(heuristic as never)})`
  await audit(actor, {
    action: 'DOCUMENT_CREATED', resourceType: 'DOCUMENT', resourceId: doc.document_id, result: 'SUCCESS',
    metadata: { via: 'DRIVE_SCAN', sourceId: src.source_id, status: 'DRAFT' },
  })
  // Saran AI (Phase 7) — kegagalan AI tidak menggagalkan scan.
  await enrichSuggestion(doc.document_id, file, restricted).catch((e) => console.warn('[suggest-ai]', e))
}

/** Dipanggil cron harian. */
export async function scanAllSources() {
  const sources = await db()<{ source_id: string; name: string }[]>`select source_id, name from drive_sources where status = 'ACTIVE' order by created_at`
  const results: { sourceId: string; name: string; ok: boolean; stats?: ScanStats; error?: string }[] = []
  for (const s of sources) {
    try {
      results.push({ sourceId: s.source_id, name: s.name, ok: true, stats: await scanSource(null, s.source_id) })
    } catch (e) {
      results.push({ sourceId: s.source_id, name: s.name, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return results
}
