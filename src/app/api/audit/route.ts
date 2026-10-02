import { NextResponse, type NextRequest } from 'next/server'
import { getAuditHistory, toCsv } from '@/server/services/audit-log'
import { errorResponse, userFromRequest, wantsJson } from '@/server/http'

/** GET /api/audit?actorUserId=&action=&result=&documentId=&q=&from=&to=&before=&limit=&format=csv — khusus Owner. Tidak ada endpoint ubah/hapus. */
export async function GET(req: NextRequest) {
  try {
    const ctx = await userFromRequest(req)
    const params = Object.fromEntries(req.nextUrl.searchParams)
    const csv = params.format === 'csv'
    const res = await getAuditHistory(ctx, { ...params, limit: csv ? 1000 : params.limit })
    if (csv) {
      return new NextResponse(toCsv(res.events), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="audit-csse-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' },
      })
    }
    return NextResponse.json({ status: 'success', data: res })
  } catch (e) {
    return errorResponse(req, e, wantsJson(req) || true, '/audit')
  }
}
