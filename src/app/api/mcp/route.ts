import { NextResponse, type NextRequest } from 'next/server'
import { authenticateAgentToken } from '@/server/services/agents'
import { handleMcpMessage, type RpcRequest, type RpcResponse } from '@/server/mcp/handler'

const MAX_BODY = 100_000

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })

/** MCP (Streamable HTTP, stateless). Autentikasi: Authorization: Bearer csse_agent_… — buat di Admin → Token AI Agent. */
export async function POST(req: NextRequest) {
  // Anti DNS-rebinding/CSRF: klien MCP non-browser tidak mengirim Origin; bila ada, harus sama dengan host.
  const origin = req.headers.get('origin')
  if (origin) {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    try {
      if (new URL(origin).host !== host) return json({ error: 'Origin tidak diizinkan' }, 403)
    } catch {
      return json({ error: 'Origin tidak valid' }, 403)
    }
  }

  const auth = req.headers.get('authorization') ?? ''
  const ctx = await authenticateAgentToken(auth.startsWith('Bearer ') ? auth.slice(7).trim() : null)
  if (!ctx) return json({ error: 'Token tidak valid, kedaluwarsa, atau sudah dicabut.' }, 401, { 'WWW-Authenticate': 'Bearer realm="csse-mcp"' })

  const raw = await req.text()
  if (raw.length > MAX_BODY) return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Permintaan terlalu besar' } }, 413)
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON tidak valid' } }, 400)
  }

  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > 20) return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Batch 1–20 pesan' } }, 400)
    const out = (await Promise.all(body.map((m) => handleMcpMessage(ctx, m as RpcRequest)))).filter((r): r is RpcResponse => r !== null)
    return out.length ? json(out) : new NextResponse(null, { status: 202 })
  }
  const res = await handleMcpMessage(ctx, body as RpcRequest)
  return res ? json(res) : new NextResponse(null, { status: 202 })
}

export async function GET() {
  return json({ error: 'Gunakan POST. Server ini tidak menyediakan stream SSE.' }, 405, { Allow: 'POST' })
}
