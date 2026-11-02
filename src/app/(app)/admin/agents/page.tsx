import { headers } from 'next/headers'
import { requireUser, sp, type SearchParams } from '@/lib/session'
import { listAgentTokens } from '@/server/services/agents'
import { listUsers } from '@/server/services/users'
import { MCP_TOOLS } from '@/server/mcp/tools'
import { AgentTokenForm } from '@/components/AgentTokenForm'
import { Flash } from '@/components/Flash'
import { fmtDateTime } from '@/lib/labels'

const STATUS_BADGE = { AKTIF: 'badge-ok', KEDALUWARSA: 'badge-muted', DICABUT: 'badge-danger' } as const

export default async function AgentsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const [tokens, users] = await Promise.all([listAgentTokens(user), listUsers(user)])
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const mcpUrl = `${proto}://${host}/api/mcp`

  return (
    <>
      <Flash msg={get('msg')} err={get('err')} />
      <div className="page-head">
        <div>
          <h1>Token AI Agent (MCP)</h1>
          <p>Beri AI agent akses <strong>baca saja</strong> ke data CSSE. Hak akses agent mengikuti user yang dipilih, dan setiap panggilan tercatat di audit.</p>
        </div>
      </div>
      <div className="card">
        <div className="small muted">Alamat server MCP</div>
        <code>{mcpUrl}</code>
        <div className="small muted" style={{ marginTop: 10 }}>Tool yang tersedia ({MCP_TOOLS.length}, semuanya baca saja)</div>
        <div className="chips-row" style={{ marginTop: 6 }}>{MCP_TOOLS.map((t) => <span key={t.name} className="chip" title={t.description}>{t.name}</span>)}</div>
      </div>
      <AgentTokenForm mcpUrl={mcpUrl} users={users.filter((u) => u.status === 'ACTIVE').map((u) => ({ userId: u.userId, label: `${u.name} · ${u.roleName}${u.divisionName ? ` · ${u.divisionName}` : ''}` }))} />
      <div className="card">
        <h2>Token yang ada</h2>
        {tokens.length === 0 ? <div className="empty">Belum ada token.</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nama</th><th>Mengikuti user</th><th>Awalan</th><th>Status</th><th>Berlaku sampai</th><th>Terakhir dipakai</th><th /></tr></thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.tokenId}>
                    <td><strong>{t.name}</strong></td>
                    <td>{t.userName}<div className="small muted">{t.divisionName ?? t.roleId}</div></td>
                    <td><code>{t.tokenPrefix}…</code></td>
                    <td><span className={`badge ${STATUS_BADGE[t.status]}`}>{t.status === 'AKTIF' ? 'Aktif' : t.status === 'DICABUT' ? 'Dicabut' : 'Kedaluwarsa'}</span></td>
                    <td className="small">{fmtDateTime(t.expiresAt)}</td>
                    <td className="small">{t.lastUsedAt ? fmtDateTime(t.lastUsedAt) : '—'}</td>
                    <td>{t.status === 'AKTIF' && <form action={`/api/admin/agents/${t.tokenId}/revoke`} method="post"><button className="btn btn-sm btn-danger" type="submit">Cabut</button></form>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
