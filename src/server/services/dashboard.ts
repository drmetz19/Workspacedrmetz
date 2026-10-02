import { db, withUserScope } from '../db'
import type { IdentityContext } from '../context'
import { visibleDocumentsWhere } from '../permissions/sql'
import { listMyRequests, listPendingApprovals, type AccessRequestDto } from './access'
import { todayJakarta } from './search'
import { getMeetingStats, listActionItems, listMeetings, type ActionItemDto, type MeetingMinutesDto, type MeetingStats } from './meetings'

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

export interface DocLite {
  documentId: string
  documentName: string
  documentNumber: string | null
  securityLevel: number
  divisionName: string | null
  categoryName: string | null
  picName: string | null
  expiryDate: string | null
  daysLeft: number | null
  status: string
}

export interface ActivityItem {
  action: string
  actorName: string | null
  actorEmail: string | null
  documentId: string | null
  documentName: string | null
  securityLevel: number | null
  result: string
  occurredAt: Date
}

export interface DivisionSummary {
  divisionId: string
  divisionName: string
  documentCount: number
  topCategories: string[]
  managerName: string | null
  expiringCount: number
}

export interface CommandCenter {
  role: IdentityContext['roleId']
  today: string
  totals: { activeDocuments: number; driveSynced: number; expiring: number; expired: number }
  pendingApprovals: AccessRequestDto[]
  drafts: DocLite[]
  draftCount: number
  expiring: DocLite[]
  recentActivity: ActivityItem[]
  restrictedActivity: ActivityItem[]
  divisions: DivisionSummary[]
  myRequests: AccessRequestDto[]
  meetingStats: MeetingStats
  recentMeetings: MeetingMinutesDto[]
  openActionItems: ActionItemDto[]
}

type LiteRow = {
  document_id: string; document_name: string; document_number: string | null; security_level: number; division_name: string | null
  category_name: string | null; pic_name: string | null; expiry_date: string | null; status: string; days_left: number | null
}
const lite = (r: LiteRow): DocLite => ({
  documentId: r.document_id, documentName: r.document_name, documentNumber: null, securityLevel: r.security_level, divisionName: r.division_name,
  categoryName: r.category_name, picName: r.pic_name, expiryDate: r.expiry_date, daysLeft: r.days_left, status: r.status,
})

/**
 * Command Center: "Apa yang membutuhkan perhatian saya sekarang?"
 * Semua angka & daftar dihitung dalam scope izin user (RLS + csse_can_view_document).
 */
export async function getCommandCenter(ctx: IdentityContext, opts: { today?: string } = {}): Promise<CommandCenter> {
  const today = opts.today ?? todayJakarta()
  const approver = ctx.roleId !== 'DIVISION_USER'
  const mineOnly = !approver

  const data = await withUserScope(ctx.userId, async (q) => {
    const base = q`
      select d.document_id, d.document_name, d.document_number, d.security_level, d.status, d.expiry_date,
        (d.expiry_date - ${today}::date) as days_left, v.division_name, c.category_name, p.name as pic_name
      from documents d
      left join divisions v on v.division_id = d.division_id
      left join categories c on c.category_id = d.category_id
      left join users p on p.user_id = d.pic_user_id`
    const expiring = await q<LiteRow[]>`${base}
      where ${visibleDocumentsWhere(q, ctx)} and d.status = 'ACTIVE' and d.expiry_date is not null
        and d.expiry_date <= ${today}::date + 90
        and ${mineOnly ? q`d.pic_user_id = ${ctx.userId}` : q`true`}
      order by d.expiry_date limit 50`
    const drafts = await q<LiteRow[]>`${base}
      where ${visibleDocumentsWhere(q, ctx)} and d.status = 'DRAFT' and ${mineOnly ? q`d.pic_user_id = ${ctx.userId}` : q`true`}
      order by d.created_at desc limit 50`
    const [tot] = await q<{ active: number; synced: number }[]>`
      select count(*) filter (where d.status = 'ACTIVE')::int as active,
             count(*) filter (where d.status = 'ACTIVE' and d.source_id is not null)::int as synced
      from documents d where ${visibleDocumentsWhere(q, ctx)}`
    const divisions = approver
      ? await q<{ division_id: string; division_name: string; document_count: number; top_categories: string[] | null; manager_name: string | null; expiring_count: number }[]>`
          select v.division_id, v.division_name,
            count(d.document_id)::int as document_count,
            (select array_agg(x.category_name order by x.n desc) from (
               select c.category_name, count(*) n from documents d2 join categories c on c.category_id = d2.category_id
               where d2.division_id = v.division_id and d2.status = 'ACTIVE' and csse_can_view_document(d2, ${ctx.userId}::uuid)
               group by c.category_name order by n desc limit 3) x) as top_categories,
            m.name as manager_name,
            count(d.document_id) filter (where d.expiry_date <= ${today}::date + 90)::int as expiring_count
          from divisions v
          left join documents d on d.division_id = v.division_id and d.status = 'ACTIVE' and csse_can_view_document(d, ${ctx.userId}::uuid)
          left join users m on m.user_id = v.manager_user_id
          where v.status = 'ACTIVE'
          group by v.division_id, v.division_name, m.name
          order by v.division_name`
      : []
    return { expiring, drafts, tot, divisions }
  })

  // Aktivitas: hanya event dokumen yang boleh diketahui user (Owner: semua).
  const activity = async (restrictedOnly: boolean) => {
    if (!approver) return []
    const rows = await db()<{ action: string; actor_name: string | null; actor_email: string | null; resource_id: string | null; document_name: string | null; security_level: number | null; result: string; occurred_at: Date }[]>`
      select a.action, u.name as actor_name, a.actor_email, a.resource_id, d.document_name, d.security_level, a.result, a.occurred_at
      from audit_events a
      join documents d on a.resource_type = 'DOCUMENT' and d.document_id::text = a.resource_id
      left join users u on u.user_id = a.actor_user_id
      where csse_can_view_document(d, ${ctx.userId}::uuid)
        and ${restrictedOnly
          ? db()`d.security_level >= 3 and a.action in ('DOCUMENT_OPENED','DOCUMENT_DOWNLOADED','ACCESS_DENIED','ACCESS_APPROVED','APPROVAL_REQUESTED','PERMISSION_CHANGED')`
          : db()`a.action not in ('DOCUMENT_VIEWED')`}
      order by a.occurred_at desc limit 8`
    return rows.map((r): ActivityItem => ({
      action: r.action, actorName: r.actor_name, actorEmail: r.actor_email, documentId: r.resource_id, documentName: r.document_name,
      securityLevel: r.security_level, result: r.result, occurredAt: r.occurred_at,
    }))
  }

  const [pendingApprovals, myRequests, recentActivity, restrictedActivity, meetingStats, recentMeetings, openActionItems] = await Promise.all([
    approver ? listPendingApprovals(ctx) : Promise.resolve([]),
    listMyRequests(ctx),
    activity(false),
    activity(true),
    getMeetingStats(ctx),
    listMeetings(ctx, { limit: 3 }),
    listActionItems(ctx, { status: 'OPEN', scope: approver ? 'all' : 'mine', limit: 6 }),
  ])
  const expiring = data.expiring.map(lite)
  return {
    role: ctx.roleId,
    today,
    totals: {
      activeDocuments: data.tot.active,
      driveSynced: data.tot.synced,
      expiring: expiring.filter((d) => (d.daysLeft ?? 0) >= 0).length,
      expired: expiring.filter((d) => (d.daysLeft ?? 0) < 0).length,
    },
    pendingApprovals,
    drafts: data.drafts.map(lite),
    draftCount: data.drafts.length,
    expiring,
    recentActivity,
    restrictedActivity,
    divisions: data.divisions.map((d) => ({
      divisionId: d.division_id, divisionName: d.division_name, documentCount: d.document_count, topCategories: d.top_categories ?? [],
      managerName: d.manager_name, expiringCount: d.expiring_count,
    })),
    myRequests: myRequests.filter((r) => r.status === 'PENDING' || r.status === 'APPROVED' || (r.status === 'REJECTED' && r.decidedAt && Date.now() - r.decidedAt.getTime() < 14 * 86_400_000)),
    meetingStats,
    recentMeetings,
    openActionItems,
  }
}
