import { NextResponse, type NextRequest } from 'next/server'
import { openDocumentFile } from '@/server/services/files'
import { errorResponse, userFromRequest, wantsJson } from '@/server/http'

function contentDisposition(kind: 'inline' | 'attachment', name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/**
 * Buka berkas dokumen: GET /api/files/{documentId}[?download=1]
 * Izin diperiksa & diaudit di service. Berkas unggahan → redirect ke URL bertanda tangan 60 detik;
 * mode tautan → redirect ke Google Drive; mode akun service → file disajikan langsung (proxy).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params
  try {
    const ctx = await userFromRequest(req)
    const res = await openDocumentFile(ctx, documentId, { download: req.nextUrl.searchParams.get('download') === '1' })
    if (res.kind === 'redirect') {
      const r = NextResponse.redirect(res.url, 303)
      r.headers.set('Cache-Control', 'private, no-store, max-age=0')
      r.headers.set('Referrer-Policy', 'no-referrer')
      return r
    }
    const file = res.file
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
