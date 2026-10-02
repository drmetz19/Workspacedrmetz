/**
 * Ekstraksi teks PDF ringan tanpa dependensi: membaca operator teks (Tj/TJ) dari stream yang
 * tidak terkompresi atau FlateDecode. Cukup untuk PDF teks biasa; PDF hasil scan → null (tanpa OCR, sesuai PRD).
 */
import { inflateSync } from 'node:zlib'

export function extractPdfText(data: Uint8Array): string | null {
  const buf = Buffer.from(data)
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return null
  const src = buf.toString('latin1')
  const chunks: string[] = []
  const re = /stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length
    const end = src.indexOf('endstream', start)
    if (end < 0) break
    const dictStart = src.lastIndexOf('<<', m.index)
    const dict = src.slice(dictStart, m.index)
    let raw = buf.subarray(start, end)
    if (/FlateDecode/.test(dict)) {
      try {
        raw = inflateSync(raw)
      } catch {
        continue
      }
    } else if (/\/Filter/.test(dict)) continue
    chunks.push(...textOps(raw.toString('latin1')))
    re.lastIndex = end
  }
  const text = chunks.join(' ').replace(/\s+/g, ' ').trim()
  return text.length >= 20 ? text.slice(0, 200_000) : null
}

function textOps(s: string): string[] {
  const out: string[] = []
  const strRe = /\((?:\\.|[^\\)])*\)\s*Tj|\[(?:[^\]]*)\]\s*TJ/g
  for (const m of s.match(strRe) ?? []) {
    for (const lit of m.match(/\((?:\\.|[^\\)])*\)/g) ?? []) {
      out.push(lit.slice(1, -1).replace(/\\([nrtbf()\\])/g, (_, c: string) => ({ n: '\n', r: '', t: ' ', b: '', f: '' })[c] ?? c))
    }
  }
  return out
}
