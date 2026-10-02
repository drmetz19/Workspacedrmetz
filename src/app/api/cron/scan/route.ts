import { NextResponse, type NextRequest } from 'next/server'
import { scanAllSources } from '@/server/services/sources'

/** Scan harian (Vercel Cron). Dilindungi header Authorization: Bearer $CRON_SECRET. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ status: 'error', code: 'UNAUTHENTICATED' }, { status: 401 })
  }
  const results = await scanAllSources()
  return NextResponse.json({ status: 'success', data: results })
}
