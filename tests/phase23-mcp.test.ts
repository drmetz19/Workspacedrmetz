import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from '@/server/db'
import { createDocumentRecord } from '@/server/services/documents'
import { authenticateAgentToken, createAgentToken, listAgentTokens, revokeAgentToken, type AgentIdentity } from '@/server/services/agents'
import { handleMcpMessage } from '@/server/mcp/handler'
import { MCP_TOOLS } from '@/server/mcp/tools'
import { createBranch, listBranches, setBranchPin, submitPublicOrder } from '@/server/services/orders'
import { POST as mcpPost, GET as mcpGet } from '@/app/api/mcp/route'
import { auditActions, closeDb, createUser, divisionId, resetDb } from './helpers'

beforeEach(resetDb)
afterAll(closeDb)

async function agentFor(owner: Awaited<ReturnType<typeof createUser>>, user: Awaited<ReturnType<typeof createUser>>, days = 30) {
  const { token } = await createAgentToken(owner, { name: 'Agent uji', userId: user.userId, days })
  const ctx = (await authenticateAgentToken(token))!
  return { token, ctx }
}

const call = async (ctx: AgentIdentity, name: string, args: Record<string, unknown> = {}) => {
  const r = await handleMcpMessage(ctx, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  const res = (r as { result: { content: { text: string }[]; isError: boolean } }).result
  return { isError: res.isError, text: res.content[0].text, data: res.isError ? null : JSON.parse(res.content[0].text) }
}

describe('token agent', () => {
  it('hanya Owner yang membuat/melihat/mencabut; token polos tidak disimpan', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const staf = await createUser({ role: 'DIVISION_USER' })
    await expect(createAgentToken(staf, { name: 'x1', userId: staf.userId })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    await expect(listAgentTokens(staf)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    const { token, agent } = await createAgentToken(owner, { name: 'Agent Legal', userId: staf.userId, days: 7 })
    expect(token.startsWith('csse_agent_')).toBe(true)
    const [row] = await db()<{ token_hash: string; token_prefix: string }[]>`select token_hash, token_prefix from agent_tokens`
    expect(row.token_hash).not.toContain(token)
    expect(token.startsWith(row.token_prefix)).toBe(true)
    expect(agent.status).toBe('AKTIF')
    await expect(revokeAgentToken(staf, agent.tokenId)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    expect((await revokeAgentToken(owner, agent.tokenId)).status).toBe('DICABUT')
    expect(await authenticateAgentToken(token)).toBeNull()
    expect((await auditActions({ action: 'AGENT_TOKEN_CREATED' })).map((a) => a.result).sort()).toEqual(['DENIED', 'SUCCESS'])
  })

  it('token salah, kedaluwarsa, atau milik user nonaktif ditolak', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const staf = await createUser({ role: 'DIVISION_USER' })
    expect(await authenticateAgentToken('csse_agent_ngawur')).toBeNull()
    expect(await authenticateAgentToken('bukan-token')).toBeNull()
    expect(await authenticateAgentToken(null)).toBeNull()
    const a = await createAgentToken(owner, { name: 'Agent A', userId: staf.userId })
    await db()`update agent_tokens set expires_at = now() - interval '1 minute'`
    expect(await authenticateAgentToken(a.token)).toBeNull()
    const b = await createAgentToken(owner, { name: 'Agent B', userId: staf.userId })
    expect(await authenticateAgentToken(b.token)).toMatchObject({ source: 'AI', userId: staf.userId })
    await db()`update users set status = 'DEACTIVATED' where user_id = ${staf.userId}`
    expect(await authenticateAgentToken(b.token)).toBeNull()
    await expect(createAgentToken(owner, { name: 'Agent C', userId: staf.userId })).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})

describe('protokol MCP', () => {
  it('initialize, ping, notifikasi, metode asing', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const { ctx } = await agentFor(owner, owner)
    const init = await handleMcpMessage(ctx, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
    expect(init).toMatchObject({ result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'csse-workspace' } } })
    const old = await handleMcpMessage(ctx, { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } })
    expect((old as { result: { protocolVersion: string } }).result.protocolVersion).toBe('2025-06-18')
    expect(await handleMcpMessage(ctx, { jsonrpc: '2.0', id: 3, method: 'ping' })).toMatchObject({ result: {} })
    expect(await handleMcpMessage(ctx, { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
    expect(await handleMcpMessage(ctx, { jsonrpc: '2.0', id: 4, method: 'resources/list' })).toMatchObject({ error: { code: -32601 } })
    expect(await handleMcpMessage(ctx, { jsonrpc: '1.0', id: 5, method: 'ping' } as never)).toMatchObject({ error: { code: -32600 } })
  })

  it('semua tool berlabel baca-saja dan tidak ada tool tulis', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const { ctx } = await agentFor(owner, owner)
    const list = (await handleMcpMessage(ctx, { jsonrpc: '2.0', id: 1, method: 'tools/list' })) as { result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] } }
    const names = list.result.tools.map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['search_documents', 'get_document_metadata', 'list_orders', 'get_order', 'list_meetings']))
    expect(list.result.tools.every((t) => t.annotations.readOnlyHint)).toBe(true)
    expect(names.filter((n) => /^(create|update|delete|approve|reject|set|record|cancel|revoke)/.test(n))).toEqual([])
    expect(MCP_TOOLS.map((t) => t.name)).toEqual(names)
  })

  it('tool tidak dikenal → error; tool memakai hak user pemilik token (staf tidak melihat divisi lain)', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const legal = await createUser({ role: 'DIVISION_USER', division: 'Legal/Perizinan' })
    const sc = await createUser({ role: 'DIVISION_USER', division: 'Supply Chain' })
    const legalDiv = await divisionId('Legal/Perizinan')
    const scDiv = await divisionId('Supply Chain')
    const d1 = await createDocumentRecord(owner, { documentName: 'SIP dokter Legal', divisionId: legalDiv, securityLevel: '2', picUserId: legal.userId })
    await createDocumentRecord(owner, { documentName: 'SOP gudang Supply', divisionId: scDiv, securityLevel: '2', picUserId: sc.userId })

    const legalAgent = (await agentFor(owner, legal)).ctx
    const res = await call(legalAgent, 'search_documents', { q: 'SOP gudang' })
    expect(res.data.results).toHaveLength(0)
    const own = await call(legalAgent, 'search_documents', { q: 'SIP dokter' })
    expect(own.data.results.map((r: { documentName: string }) => r.documentName)).toEqual(['SIP dokter Legal'])

    const denied = await call(legalAgent, 'get_document_metadata', { documentId: '00000000-0000-4000-8000-000000000000' })
    expect(denied.isError).toBe(true)
    const meta = await call(legalAgent, 'get_document_metadata', { documentId: d1.documentId })
    expect(meta.data.documentName).toBe('SIP dokter Legal')

    const unknown = await handleMcpMessage(legalAgent, { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'delete_document', arguments: {} } })
    expect(unknown).toMatchObject({ id: 9, error: { code: -32602 } })
  })

  it('pesanan barang: PSCM melihat semua, user lain tidak; link/PIN cabang tidak bocor', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const pscm = await createUser({ role: 'DIVISION_USER', division: 'Supply Chain' })
    const staf = await createUser({ role: 'DIVISION_USER', division: 'Legal/Perizinan' })
    const bhy = (await listBranches(owner)).find((b) => b.branchCode === 'BHY')!
    await setBranchPin(owner, bhy.branchId, { pin: 'Kode1234' })
    await submitPublicOrder({ token: bhy.publicToken, pin: 'Kode1234', requesterName: 'Sari', itemsJson: JSON.stringify([{ itemName: 'Masker medis', qty: 5, unit: 'box' }]) })

    const orders = await call((await agentFor(owner, pscm)).ctx, 'list_orders', {})
    expect(orders.data).toHaveLength(1)
    const one = await call((await agentFor(owner, pscm)).ctx, 'get_order', { orderId: orders.data[0].poId })
    expect(one.data.items[0].itemName).toBe('Masker medis')
    expect((await call((await agentFor(owner, staf)).ctx, 'list_orders', {})).data).toHaveLength(0)
    expect((await call((await agentFor(owner, staf)).ctx, 'get_order', { orderId: orders.data[0].poId })).isError).toBe(true)

    const branches = await call((await agentFor(owner, pscm)).ctx, 'list_branches', {})
    expect(JSON.stringify(branches.data)).not.toContain(bhy.publicToken)
    expect(JSON.stringify(branches.data)).not.toMatch(/pin/i)
    await createBranch(owner, { branchName: 'Sukabumi', branchCode: 'SKB' })
  })

  it('setiap pemanggilan tool tercatat di audit dengan source AI', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const { ctx } = await agentFor(owner, owner)
    await call(ctx, 'list_divisions')
    await call(ctx, 'get_document_metadata', { documentId: 'bukan-uuid' })
    const rows = await db()<{ result: string; source: string; metadata: { tool: string; agent: string } }[]>`
      select result, source, metadata from audit_events where action = 'MCP_TOOL_CALLED' order by occurred_at`
    expect(rows.map((r) => [r.metadata.tool, r.result, r.source])).toEqual([['list_divisions', 'SUCCESS', 'AI'], ['get_document_metadata', 'FAILED', 'AI']])
    expect(rows[0].metadata.agent).toBe('Agent uji')
  })
})

describe('endpoint /api/mcp', () => {
  const req = (init: { token?: string; body?: unknown; headers?: Record<string, string> }) =>
    new NextRequest('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost:3000', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...init.headers },
      body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body ?? {}),
    })

  it('tanpa/ salah token → 401; GET → 405; origin asing → 403', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const { token } = await agentFor(owner, owner)
    expect((await mcpPost(req({ body: { jsonrpc: '2.0', id: 1, method: 'ping' } }))).status).toBe(401)
    expect((await mcpPost(req({ token: 'csse_agent_salah', body: { jsonrpc: '2.0', id: 1, method: 'ping' } }))).status).toBe(401)
    expect((await mcpGet()).status).toBe(405)
    expect((await mcpPost(req({ token, headers: { origin: 'https://evil.example' }, body: { jsonrpc: '2.0', id: 1, method: 'ping' } }))).status).toBe(403)
  })

  it('token valid: tools/list, batch, notifikasi (202), JSON rusak (400)', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const { token } = await agentFor(owner, owner)
    const list = await mcpPost(req({ token, body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } }))
    expect(list.status).toBe(200)
    expect((await list.json()).result.tools.length).toBe(MCP_TOOLS.length)
    const batch = await mcpPost(req({ token, body: [{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }] }))
    expect(await batch.json()).toHaveLength(1)
    expect((await mcpPost(req({ token, body: { jsonrpc: '2.0', method: 'notifications/initialized' } }))).status).toBe(202)
    expect((await mcpPost(req({ token, body: '{rusak' }))).status).toBe(400)
  })
})
