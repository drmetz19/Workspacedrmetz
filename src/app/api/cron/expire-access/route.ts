import { NextResponse, type NextRequest } from 'next/server'
import { expireAccessGrants } from '@/server/services/access'

/** Menandai akses sementara yang lewat waktu sebagai EXPIRED (engine sudah menolak akses sejak expires_at). */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ status: 'error', code: 'UNAUTHENTICATED' }, { status: 401 })
  }
  return NextResponse.json({ status: 'success', data: await expireAccessGrants() })
}
