import { db } from '../../db'
import { AiUnavailableError, type AiProvider, type AiRequest } from './types'

/**
 * Provider AI DETERMINISTIK untuk pengembangan & test (AI_PROVIDER=mock).
 * Membaca blok `INPUT_JSON:` dari prompt orchestrator dan menghasilkan keluaran berformat sama
 * seperti model sungguhan, sehingga seluruh alur (validasi, sitasi, izin) bisa diuji tanpa vendor.
 */
const requests: AiRequest[] = []
export const mockAiRequests = () => requests

async function failing() {
  if (process.env.MOCK_AI_FAIL === '1') return true
  const [r] = await db()<{ value: string }[]>`select value from dev_flags where key = 'MOCK_AI_FAIL'`.catch(() => [])
  return r?.value === '1'
}

function input(prompt: string): Record<string, unknown> {
  const i = prompt.lastIndexOf('INPUT_JSON:')
  return i >= 0 ? JSON.parse(prompt.slice(i + 'INPUT_JSON:'.length)) : {}
}

const CATS: [RegExp, string][] = [
  [/\bizin operasional|\bnib\b|izin usaha/i, 'Izin Operasional'],
  [/surat izin praktik|\bsip\b/i, 'SIP'],
  [/surat tanda registrasi|\bstr\b/i, 'STR'],
  [/nota kesepahaman|\bmou\b/i, 'MoU'],
  [/\bsewa\b/i, 'Sewa'],
  [/perjanjian|kontrak|\bpks\b/i, 'Kontrak'],
  [/sertifikat|akreditasi/i, 'Sertifikat'],
]

function toIso(d: string): string | null {
  let m = d.match(/(20\d{2})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = d.match(/(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

function suggest(inp: Record<string, unknown>) {
  const text = String(inp.text ?? '')
  const name = String(inp.fileName ?? '')
  const hay = `${name}\n${text}`
  const out: Record<string, unknown> = { confidence: text ? 0.8 : 0.4 }
  out.documentName = name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ').trim()
  for (const [re, c] of CATS) if (re.test(hay)) { out.categoryName = c; break }
  const no = text.match(/nomor\s*[:\-]?\s*([A-Z0-9][A-Z0-9./-]{3,40})/i)
  if (no) out.documentNumber = no[1].replace(/[./-]+$/, '')
  const exp = text.match(/(?:berlaku (?:sampai|hingga)|masa berlaku[^:]*:|kedaluwarsa|expired?)\s*(?:tanggal\s*)?[:\-]?\s*([0-9]{1,4}[-/.][0-9]{1,2}[-/.][0-9]{1,4})/i)
  if (exp) out.expiryDate = toIso(exp[1])
  const eff = text.match(/(?:ditetapkan|berlaku sejak|tanggal terbit|mulai berlaku)\s*(?:tanggal\s*)?[:\-]?\s*([0-9]{1,4}[-/.][0-9]{1,2}[-/.][0-9]{1,4})/i)
  if (eff) out.effectiveDate = toIso(eff[1])
  const pic = text.match(/penanggung jawab\s*[:\-]\s*([A-Za-z .,]{3,40})/i)
  if (pic) out.picName = pic[1].trim()
  if (text) out.summary = text.replace(/\s+/g, ' ').slice(0, 220)
  out.securityLevel = inp.restricted ? 3 : /rahasia|confidential/i.test(text) ? 3 : 2
  return out
}

function answer(inp: Record<string, unknown>) {
  const q = String(inp.question ?? '').toLowerCase()
  const docs = (inp.documents ?? []) as { ref: string; name: string; status: string; category?: string | null; division?: string | null; summary?: string | null; number?: string | null; expiryDate?: string | null; pic?: string | null }[]
  const stop = new Set(['cari', 'carikan', 'tolong', 'yang', 'dan', 'di', 'ke', 'apa', 'saja', 'mana', 'dokumen', 'terbaru', 'terakhir', 'untuk', 'dari', 'ada', 'tidak', 'apakah', 'berapa', 'kapan', 'siapa', 'tampilkan'])
  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !stop.has(t))
  const hits = docs
    .map((d) => {
      const hay = [d.name, d.category, d.division, d.summary, d.number, d.pic].join(' ').toLowerCase()
      return { d, score: tokens.filter((t) => hay.includes(t)).length }
    })
    .filter((x) => x.score > 0 && x.score >= Math.ceil(tokens.length * 0.6))
    .sort((a, b) => b.score - a.score || (a.d.status === 'ACTIVE' ? -1 : 1))
  if (!hits.length) return { answer: 'Saya tidak menemukan dokumen yang sesuai di antara dokumen yang boleh Anda akses.', citations: [], found: false }
  const top = hits.slice(0, 3)
  const lines = top.map(({ d }) => `• ${d.name}${d.status !== 'ACTIVE' ? ' (tidak berlaku)' : ''}${d.expiryDate ? ` — berlaku s.d. ${d.expiryDate}` : ''} [${d.ref}]`)
  return { answer: `Dokumen yang paling sesuai:\n${lines.join('\n')}`, citations: top.map(({ d }) => d.ref), found: true }
}

export const mockAiProvider: AiProvider = {
  name: 'mock',
  isConfigured: () => true,
  async generate(req) {
    requests.push(req)
    if (await failing()) throw new AiUnavailableError()
    const inp = input(req.prompt)
    const out = req.task === 'suggest_metadata' ? suggest(inp) : req.task === 'answer_search' ? answer(inp) : {}
    return { text: JSON.stringify(out), provider: 'mock' }
  },
}
