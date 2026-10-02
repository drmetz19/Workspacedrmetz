import type { Sql, Tx } from '../db'
import type { IdentityContext } from '../context'

/**
 * Fragmen WHERE untuk dokumen yang boleh DIKETAHUI user (alias tabel `d`).
 * Harus selalu konsisten dengan `canView` di engine.ts (diuji bersama).
 */
export function visibleDocumentsWhere(q: Sql | Tx, ctx: IdentityContext) {
  if (ctx.roleId === 'OWNER' || ctx.roleId === 'GM') return q`true`
  return q`(d.pic_user_id = ${ctx.userId} or (${ctx.divisionId}::uuid is not null and d.division_id = ${ctx.divisionId}::uuid))`
}
