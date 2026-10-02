import { NextResponse, type NextRequest } from 'next/server'
import { openDriveLink } from '@/server/services/files'
import { errorResponse, userFromRequest } from '@/server/http'

/** GET → audit DOCUMENT_OPENED lalu redirect ke Google Drive (khusus L1–2). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const url = await openDriveLink(await userFromRequest(req), id)
    return NextResponse.redirect(url, 303)
  } catch (e) {
    return errorResponse(req, e, false, `/documents/${id}`)
  }
}
