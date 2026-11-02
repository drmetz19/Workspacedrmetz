'use client'
import { useState } from 'react'
import { Icon } from './Icon'
import { CopyButton } from './CopyButton'

interface UserOpt { userId: string; label: string }

/** Membuat token agent. Token polos hanya ditampilkan di sini sekali; tidak disimpan di server maupun browser. */
export function AgentTokenForm({ users, mcpUrl }: { users: UserOpt[]; mcpUrl: string }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<{ token: string; name: string } | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget).entries())),
      })
      const json = await res.json()
      if (json.status === 'success') setMade({ token: json.data.token, name: json.data.agent.name })
      else setError(json.message ?? 'Gagal membuat token.')
    } catch {
      setError('Tidak bisa terhubung. Coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  if (made) {
    const cli = `claude mcp add --transport http csse ${mcpUrl} --header "Authorization: Bearer ${made.token}"`
    const cfg = JSON.stringify({ mcpServers: { csse: { type: 'http', url: mcpUrl, headers: { Authorization: `Bearer ${made.token}` } } } }, null, 2)
    return (
      <div className="card">
        <div className="flash flash-warn" role="status">Salin token sekarang. Token tidak akan ditampilkan lagi; bila hilang, buat token baru dan cabut yang lama.</div>
        <h2>Token &ldquo;{made.name}&rdquo;</h2>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--surface-2)', padding: 10, borderRadius: 6 }}>{made.token}</pre>
        <div className="row" style={{ margin: '8px 0 16px' }}><CopyButton text={made.token} label="Salin token" /></div>
        <h3>Sambungkan ke Claude Code</h3>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--surface-2)', padding: 10, borderRadius: 6 }}>{cli}</pre>
        <div className="row" style={{ margin: '8px 0 16px' }}><CopyButton text={cli} label="Salin perintah" /></div>
        <h3>Atau konfigurasi JSON (.mcp.json / klien MCP lain)</h3>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--surface-2)', padding: 10, borderRadius: 6 }}>{cfg}</pre>
        <div className="row" style={{ marginTop: 8 }}>
          <CopyButton text={cfg} label="Salin JSON" />
          <button type="button" className="btn btn-primary" onClick={() => { setMade(null); window.location.reload() }}>Selesai</button>
        </div>
      </div>
    )
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Buat token agent</h2>
      {error && <div className="flash flash-err" role="alert">{error}</div>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="name">Nama agent</label>
          <input id="name" name="name" required minLength={2} maxLength={60} placeholder="mis. Agent Supply Chain" />
        </div>
        <div className="field">
          <label htmlFor="userId">Hak akses mengikuti user</label>
          <select id="userId" name="userId" required defaultValue="">
            <option value="" disabled>— Pilih user —</option>
            {users.map((u) => <option key={u.userId} value={u.userId}>{u.label}</option>)}
          </select>
          <div className="field-hint">Agent hanya melihat yang boleh dilihat user ini. Pilih staf divisi, bukan Owner, kecuali memang perlu.</div>
        </div>
        <div className="field">
          <label htmlFor="days">Berlaku (hari)</label>
          <input id="days" name="days" type="number" min={1} max={365} defaultValue={30} />
        </div>
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}><Icon name="key" /> {busy ? 'Membuat…' : 'Buat token'}</button>
    </form>
  )
}
