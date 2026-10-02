import { withUserScope } from '../db'
import type { IdentityContext } from '../context'
import { visibleDocumentsWhere } from '../permissions/sql'

/** Angka badge di sidebar. */
export async function shellCounts(ctx: IdentityContext) {
  return withUserScope(ctx.userId, async (q) => {
    const [r] = await q<{ drafts: number }[]>`select count(*)::int as drafts from documents d where d.status = 'DRAFT' and ${visibleDocumentsWhere(q, ctx)}`
    const pending = ctx.roleId === 'DIVISION_USER' ? 0 : (await q<{ n: number }[]>`
      select count(*)::int as n from access_requests r where r.status = 'PENDING' and r.requester_user_id <> ${ctx.userId}
        and ${ctx.roleId === 'OWNER' ? q`true` : q`r.approver_role = 'GM'`}`)[0].n
    return { draftsToReview: r.drafts, pendingApprovals: pending }
  })
}
