import type { Sql, Tx } from '../db'
import type { IdentityContext } from '../context'

/**
 * Fragmen WHERE: dokumen yang boleh DIKETAHUI user (alias tabel `d`).
 * Memanggil fungsi DB `csse_can_view_document` — cermin `canView` di engine.ts (paritas diuji).
 */
export function visibleDocumentsWhere(q: Sql | Tx, ctx: IdentityContext) {
  return q`csse_can_view_document(d, ${ctx.userId}::uuid)`
}
