import Link from 'next/link'
import { Fragment } from 'react'
import { requireUser, sp, type SearchParams } from '@/lib/session'
import { askDocuments, type AskResult } from '@/server/services/ask'
import { guard } from '@/lib/page-guard'
import { LevelBadge, StatusBadge, ExpiryBadge } from '@/components/Badges'
import { Icon } from '@/components/Icon'

const EXAMPLES = [
  'Cari izin operasional klinik Jakarta terbaru',
  'Dokumen legal apa yang akan kedaluwarsa?',
  'Cari kontrak terakhir vendor laser',
  'Apa saja yang sedang menunggu approval saya?',
]

function Answer({ r }: { r: AskResult }) {
  const byRef = new Map(r.citations.map((c) => [c.ref, c]))
  const parts = r.answer.split(/(\[D\d+\])/g)
  return (
    <div className="chat-answer">
      {parts.map((p, i) => {
        const m = p.match(/^\[(D\d+)\]$/)
        const c = m ? byRef.get(m[1]) : undefined
        return c ? <Link key={i} className="cite" href={`/documents/${c.documentId}`} title={c.documentName}>{m![1]}</Link> : <Fragment key={i}>{p}</Fragment>
      })}
    </div>
  )
}

export default async function AskPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const q = (get('q') ?? '').trim()
  const res = q ? await guard(() => askDocuments(user, { question: q })) : null

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Icon name="psychology" size={14} /> CSSE AI Assistant</div>
          <h1>Tanya AI CSSE</h1>
          <p>Tanyakan dokumen dengan bahasa sehari-hari. AI hanya melihat metadata dokumen yang boleh Anda akses.</p>
        </div>
      </div>
      <form className="ask-bar" style={{ marginTop: 0 }} method="get" action="/search/ask">
        <span className="ai-mark"><Icon name="psychology" /></span>
        <div style={{ flex: '1 1 260px' }}>
          <strong>Apa yang Anda cari?</strong>
          <div className="small muted">Mis. “{EXAMPLES[0]}”</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flex: '2 1 360px' }}>
          <input name="q" defaultValue={q} placeholder="Tanyakan sesuatu pada AI…" minLength={3} maxLength={500} required aria-label="Pertanyaan" />
          <button className="btn btn-teal" type="submit"><Icon name="send" /> Tanya</button>
        </div>
      </form>

      {!q && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Contoh pertanyaan</h3>
          <div className="row">
            {EXAMPLES.map((e) => <Link key={e} className="btn btn-sm" href={`/search/ask?q=${encodeURIComponent(e)}`}>{e}</Link>)}
          </div>
        </div>
      )}

      {res && !res.ok && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="flash flash-warn" style={{ marginBottom: 10 }}>{res.message}</div>
          <Link className="btn" href={`/search?q=${encodeURIComponent(q)}`}><Icon name="manage_search" /> Buka pencarian filter</Link>
        </div>
      )}

      {res && res.ok && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <strong>Jawaban</strong>
            <span className="badge badge-ok"><Icon name="verified_user" size={12} /> Dibatasi izin Anda</span>
            <span className="spacer" />
            <span className="small muted">{res.data.contextSize} dokumen relevan ditinjau</span>
          </div>
          <Answer r={res.data} />
          {res.data.citations.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>Sumber</h3>
              <ul className="list">
                {res.data.citations.map((c) => (
                  <li key={c.ref} className="row">
                    <span className="cite">{c.ref}</span>
                    <Link href={`/documents/${c.documentId}`}><strong>{c.documentName}</strong></Link>
                    <span className="small muted">v{c.version}</span>
                    <span className="spacer" />
                    <LevelBadge level={c.securityLevel} />
                    <StatusBadge status={c.status} />
                    <ExpiryBadge date={c.expiryDate} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {!res.data.found && (
            <div className="row" style={{ marginTop: 12 }}>
              <Link className="btn" href={`/search?q=${encodeURIComponent(q)}`}><Icon name="manage_search" /> Coba pencarian filter</Link>
            </div>
          )}
        </div>
      )}
    </>
  )
}
