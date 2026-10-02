import { db } from '../db'
import { driveAdapter, type DriveFile } from '../integrations/drive'
import { aiProvider } from '../integrations/ai'
import { suggestMetadata } from '../ai/orchestrator'

/**
 * Saran metadata AI untuk draft hasil scan.
 * - Folder STANDARD: teks yang bisa diekstrak dikirim ke provider AI.
 * - Folder RESTRICTED: HANYA nama file + metadata Drive (isi tidak pernah dikirim ke provider eksternal).
 * - File tak terbaca: flag CONTENT_UNREADABLE + saran dari nama file.
 */
export async function enrichSuggestion(documentId: string, file: DriveFile, restricted: boolean): Promise<void> {
  let text: string | null = null
  if (!restricted) {
    try {
      text = await driveAdapter().extractText(file)
    } catch {
      text = null
    }
    if (!text || text.trim().length < 20) {
      text = null
      await db()`update documents set flag_content_unreadable = true where document_id = ${documentId}`
    }
  }
  if (!aiProvider().isConfigured()) return
  const [categories, divisions, people] = await Promise.all([
    db()<{ category_name: string }[]>`select category_name from categories where status = 'ACTIVE'`,
    db()<{ division_name: string }[]>`select division_name from divisions where status = 'ACTIVE'`,
    db()<{ name: string }[]>`select name from users where status <> 'DEACTIVATED'`,
  ])
  const res = await suggestMetadata({
    fileName: file.name,
    path: file.path,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    text,
    restricted,
    categories: categories.map((c) => c.category_name),
    divisions: divisions.map((d) => d.division_name),
    people: people.map((p) => p.name),
  })
  await db()`insert into document_suggestions (document_id, source, provider, input_scope, fields)
             values (${documentId}, 'AI', ${res.provider}, ${res.scope}, ${db().json(res.fields as never)})`
}
