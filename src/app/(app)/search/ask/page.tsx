import Link from 'next/link'
import { Fragment } from 'react'
import { requireUser, sp, type SearchParams } from '@/lib/session'
import { askDocuments, listAskHistory, type AskCitation, type AskResult } from '@/server/services/ask'
import { directoryCounts } from '@/server/services/documents'
import { aiProvider } from '@/server/integrations/ai'
import { guard } from '@/lib/page-guard'
import { LevelBadge, daysUntil } from '@/components/Badges'
import { ValidityBadge } from '@/components/ValidityBadge'
import { Flash } from '@/components/Flash'
import { Icon } from '@/components/Icon'
import { ROLE_LABEL, fmtDate, fmtDateTime } from '@/lib/labels'
import { initials } from '@/lib/initials'

const EXAMPLES = [
  'Kapan izin operasional klinik Jakarta berakhir?',
  'Dokumen legal apa yang akan kedaluwarsa?',
  'Cari kontrak terakhir vendor laser',
  'Apa saja yang sedang menunggu approval saya?',
]

function AnswerText({ r }: { r: AskResult }) {
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

function remaining(days: number) {
  const y = Math.floor(days / 365)
  const m = Math.floor((days % 365) / 30)
  if (y > 0) return `sisa ${y} tahun${m ? ` ${m} bulan` : ''}`
  if (m > 0) return `sisa ${m} bulan`
  return `sisa ${days} hari`
}

function renewalStatus(c: AskCitation) {
  if (c.status === 'SUPERSEDED') return 'Sudah diganti versi yang lebih baru — gunakan versi aktif.'
  const d = daysUntil(c.expiryDate)
  if (d === null) return 'Tidak memiliki masa berlaku — tidak perlu perpanjangan.'
  if (d < 0) return `Sudah kedaluwarsa ${-d} hari — segera ajukan perpanjangan.`
  if (d <= 90) return `Perlu diperpanjang dalam ${d} hari.`
  return 'Masih berlaku — belum perlu perpanjangan.'
}

function OpenButton({ c }: { c: AskCitation }) {
  if (!c.canOpen) return <Link className="btn btn-sm" href={`/documents/${c.documentId}#open`}><Icon name="lock" /> Minta akses</Link>
  if (!c.hasFile) return <Link className="btn btn-sm" href={`/documents/${c.documentId}`}>Lihat detail</Link>
  return c.openMode === 'DRIVE'
    ? <a className="btn btn-sm" href={`/api/documents/${c.documentId}/open-drive`} target="_blank" rel="noreferrer"><Icon name="open_in_new" /> Buka di Google Drive</a>
    : <a className="btn btn-sm" href={`/api/files/${c.documentId}`} target="_blank" rel="noreferrer"><Icon name="lock_open" /> Buka lewat CSSE</a>
}

function FoundCard({ c }: { c: AskCitation }) {
  const days = daysUntil(c.expiryDate)
  return (
    <div className="found-card">
      <div className="found-head">
        <span className="found-icon"><Icon name="verified" size={20} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow">Ditemukan dokumen resmi</div>
          <Link href={`/documents/${c.documentId}`} className="found-title">{c.documentName}</Link>
        </div>
        <ValidityBadge doc={c} />
      </div>
      <div className="found-body">
        <div className="eyebrow" style={{ marginBottom: 8 }}>Ringkasan inti dokumen</div>
        <ul className="found-list">
          <li><Icon name="tag" size={16} /><span><strong>Nomor dokumen:</strong> {c.documentNumber ? <span className="mono">{c.documentNumber}</span> : <span className="muted">{c.canOpen ? 'Tidak dicatat' : 'Disembunyikan — ajukan akses untuk melihat'}</span>}</span></li>
          <li><Icon name="event" size={16} /><span><strong>Masa berlaku:</strong> {c.effectiveDate ? fmtDate(c.effectiveDate) : 'Tanggal berlaku tidak dicatat'}{c.expiryDate ? ` s.d. ${fmtDate(c.expiryDate)}` : ''}{days !== null && days >= 0 ? ` (masih aktif, ${remaining(days)})` : ''}</span></li>
          <li><Icon name="autorenew" size={16} /><span><strong>Status perpanjangan:</strong> {renewalStatus(c)}</span></li>
          <li><Icon name="badge" size={16} /><span><strong>Penanggung jawab:</strong> {c.picName ?? 'Belum ditentukan'}{c.divisionName ? ` (${c.divisionName})` : ''}</span></li>
        </ul>
      </div>
      <div className="found-file">
        <span className="file-icon"><Icon name="description" size={18} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}><strong className="truncate">{c.documentName}</strong> <LevelBadge level={c.securityLevel} /></div>
          <div className="small muted">{c.categoryName ?? 'Tanpa kategori'} · v{c.version}{c.hasFile ? ' · tertaut ke Google Drive' : ' · belum ada tautan Drive'}</div>
        </div>
        <OpenButton c={c} />
      </div>
    </div>
  )
}

export default async function AskPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const { get } = await sp(searchParams)
  const q = (get('q') ?? '').trim()
  const showHistory = get('history') === '1'
  const [res, history, counts] = await Promise.all([
    q ? guard(() => askDocuments(user, { question: q })) : Promise.resolve(null),
    listAskHistory(user, 12),
    directoryCounts(user),
  ])
  const aiOn = aiProvider().isConfigured()
  const divisions = counts.byDivision.filter((d) => d.divisionId)
  const askedAt = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
  const returnTo = `/search/ask?q=${encodeURIComponent(q)}`

  return (
    <div className="ask-page">
      <Flash msg={get('msg')} err={get('err')} />
      <div className="page-head">
        <div>
          <h1 className="row" style={{ gap: 10 }}>
            <span className="ai-mark"><Icon name="psychology" size={18} /></span>
            Tanya Dokumen &amp; Regulasi Klinik
            <span className={`badge ${aiOn ? 'badge-ok' : 'badge-muted'}`}>{aiOn ? 'CSSE AI aktif' : 'AI nonaktif'}</span>
          </h1>
          <p>Tanyakan isi berkas, masa berlaku izin, kontrak rekanan, atau SOP divisi dengan bahasa sehari-hari.</p>
        </div>
        <div className="row">
          <Link className={`btn${showHistory ? ' btn-primary' : ''}`} href={showHistory ? (q ? returnTo : '/search/ask') : `/search/ask?${new URLSearchParams({ ...(q ? { q } : {}), history: '1' })}`}>
            <Icon name="history" /> Riwayat Chat
          </Link>
          <Link className="btn" href="/search/ask"><Icon name="add_comment" /> Percakapan Baru</Link>
        </div>
      </div>

      <div className="chips-row">
        <span className="small muted"><Icon name="lightbulb" size={14} /> Rekomendasi:</span>
        {EXAMPLES.map((e) => <Link key={e} className="chip" href={`/search/ask?q=${encodeURIComponent(e)}`}>&ldquo;{e}&rdquo;</Link>)}
      </div>

      <div className="ask-grid">
        <section className="chat-col" aria-label="Percakapan">
          {!q && (
            <div className="bubble-ai">
              <span className="ai-avatar"><Icon name="smart_toy" size={16} /></span>
              <div className="bubble-card">
                <div className="small muted" style={{ marginBottom: 6 }}>CSSE Document Assistant</div>
                <p style={{ margin: '0 0 10px' }}>Halo {user.name.split(' ')[0]}, tanyakan dokumen apa saja — saya hanya membaca dokumen yang boleh Anda akses.</p>
                <h3 style={{ margin: '0 0 8px' }}>Contoh pertanyaan</h3>
                <div className="row">
                  {EXAMPLES.map((e) => <Link key={e} className="btn btn-sm" href={`/search/ask?q=${encodeURIComponent(e)}`}>{e}</Link>)}
                </div>
              </div>
            </div>
          )}

          {q && (
            <div className="bubble-user">
              <div className="small muted" style={{ textAlign: 'right', marginBottom: 4 }}>{user.name} · {askedAt} WIB</div>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 10, flexWrap: 'nowrap' }}>
                <div className="user-text">{q}</div>
                <span className="avatar avatar-sm">{initials(user.name)}</span>
              </div>
            </div>
          )}

          {res && !res.ok && (
            <div className="bubble-ai">
              <span className="ai-avatar"><Icon name="smart_toy" size={16} /></span>
              <div className="bubble-card">
                <div className="flash flash-warn" style={{ marginBottom: 10 }}>{res.message}</div>
                <Link className="btn" href={`/search?q=${encodeURIComponent(q)}`}><Icon name="manage_search" /> Buka pencarian filter</Link>
              </div>
            </div>
          )}

          {res && res.ok && (
            <div className="bubble-ai">
              <span className="ai-avatar"><Icon name="smart_toy" size={16} /></span>
              <div className="bubble-card">
                <div className="row small muted" style={{ marginBottom: 10 }}>
                  <strong style={{ color: 'var(--ink)' }}>CSSE Document Assistant</strong>
                  <span>·</span>
                  <span className="badge badge-ok"><Icon name="verified_user" size={12} /> Dibatasi izin Anda</span>
                  <span className="spacer" />
                  <span>{res.data.contextSize} dokumen relevan ditinjau</span>
                </div>
                {res.data.citations[0] && <FoundCard c={res.data.citations[0]} />}
                <AnswerText r={res.data} />
                {res.data.citations.length > 1 && (
                  <>
                    <div className="eyebrow" style={{ margin: '14px 0 6px' }}>Sumber lain</div>
                    <ul className="list">
                      {res.data.citations.slice(1).map((c) => (
                        <li key={c.ref} className="row">
                          <span className="cite">{c.ref}</span>
                          <Link href={`/documents/${c.documentId}`}><strong>{c.documentName}</strong></Link>
                          <span className="small muted">v{c.version}</span>
                          <span className="spacer" />
                          <LevelBadge level={c.securityLevel} />
                          <ValidityBadge doc={c} />
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
                <div className="feedback-row">
                  <span className="small muted">Apakah jawaban ini membantu?</span>
                  {(['yes', 'no'] as const).map((h) => (
                    <form key={h} action="/api/ask/feedback" method="post">
                      <input type="hidden" name="question" value={q} />
                      <input type="hidden" name="helpful" value={h} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button className="btn btn-sm btn-icon" type="submit" aria-label={h === 'yes' ? 'Membantu' : 'Belum membantu'}>
                        <Icon name={h === 'yes' ? 'thumb_up' : 'thumb_down'} size={15} />
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="ask-aside" aria-label="Panel samping">
          {showHistory ? (
            <div className="card">
              <div className="row" style={{ marginBottom: 8 }}><strong>Riwayat chat</strong><span className="spacer" /><span className="small muted">milik Anda</span></div>
              {history.length === 0 ? <div className="small muted">Belum ada pertanyaan.</div> : (
                <ul className="history-list">
                  {history.map((h) => (
                    <li key={h.question + h.askedAt.toISOString()}>
                      <Link href={`/search/ask?${new URLSearchParams({ q: h.question, history: '1' })}`}>{h.question}</Link>
                      <div className="small muted">{fmtDateTime(h.askedAt)}{h.found ? '' : ' · tidak ditemukan'}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="card">
              <div className="row" style={{ marginBottom: 4 }}><strong>Divisi sumber data</strong><span className="spacer" /><Icon name="hub" size={16} /></div>
              <p className="small muted" style={{ marginTop: 0 }}>Asisten membaca dokumen terdaftar dari divisi berikut (sesuai izin Anda):</p>
              {divisions.length === 0 ? <div className="small muted">Belum ada dokumen yang bisa Anda akses.</div> : (
                <ul className="source-list">
                  {divisions.map((d) => (
                    <li key={d.divisionId}>
                      <Link href={`/documents?division=${d.divisionId}`} className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                        <Icon name="folder" size={16} /><span style={{ flex: 1 }}>{d.divisionName}</span>
                        <span className="count">{d.count.toLocaleString('id-ID')} berkas</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="card guard-card">
            <div className="row" style={{ marginBottom: 6, gap: 8 }}><Icon name="shield_lock" size={18} /><strong>Jaminan keamanan CSSE</strong></div>
            <p className="small" style={{ margin: 0 }}>
              Jawaban hanya disusun dari dokumen yang boleh Anda akses. Keputusan akses ditentukan aturan CSSE, bukan AI.
              Nomor &amp; ringkasan dokumen yang belum boleh Anda buka tidak dikirim ke AI, dan setiap pertanyaan tercatat di audit.
            </p>
          </div>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 6 }}>Tips bertanya</div>
            <p className="small" style={{ margin: 0 }}>Sebut jenis dokumen + kata kunci spesifik, mis. <em>&ldquo;Kapan SIP dr. Sarah berakhir?&rdquo;</em> atau <em>&ldquo;Kontrak vendor laser terbaru&rdquo;</em>.</p>
          </div>
        </aside>
      </div>

      <form className="composer" method="get" action="/search/ask">
        <div className="composer-box">
          <Icon name="chat" size={18} />
          <input name="q" defaultValue="" placeholder="Ketik pertanyaan mengenai izin, kontrak, atau dokumen klinik…" minLength={3} maxLength={500} required aria-label="Pertanyaan" />
          {showHistory && <input type="hidden" name="history" value="1" />}
          <button className="btn btn-primary" type="submit"><Icon name="send" /> Tanya AI</button>
        </div>
        <div className="composer-foot small muted">
          <span>Mencakup {divisions.length} divisi sesuai izin Anda</span>
          <span><Icon name="verified_user" size={12} /> Hak akses: {ROLE_LABEL[user.roleId] ?? user.roleId}</span>
          <span>Tekan Enter untuk bertanya</span>
        </div>
      </form>
    </div>
  )
}
