import { withUserScope } from '../db'
import type { IdentityContext } from '../context'
import { visibleDocumentsWhere } from '../permissions/sql'

/** Angka badge di sidebar. */
export async function shellCounts(ctx: IdentityContext) {
  return withUserScope(ctx.userId, async (q) => {
    const [r] = await q<{ drafts: number }[]>`select count(*)::int as drafts from documents d where d.status = 'DRAFT' and ${visibleDocumentsWhere(q, ctx)}`
    return { draftsToReview: r.drafts }
  })
}
