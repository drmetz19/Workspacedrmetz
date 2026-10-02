import { NextResponse, type NextRequest } from 'next/server'
import { getAuthorizedDocument } from '@/server/services/files'
import { errorResponse, userFromRequest, wantsJson } from '@/server/http'

function contentDisposition(kind: 'inline' | 'attachment', name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/** Proxy file dokumen: GET /api/files/{documentId}[?download=1] */
export async function GET(req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params
  try {
    const ctx = await userFromRequest(req)
    const file = await getAuthorizedDocument(ctx, documentId, { download: req.nextUrl.searchParams.get('download') === '1' })
    return new NextResponse(Buffer.from(file.data), {
      status: 200,
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': contentDisposition(file.disposition, file.fileName),
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    })
  } catch (e) {
    return errorResponse(req, e, wantsJson(req), `/documents/${documentId}`)
  }
}
