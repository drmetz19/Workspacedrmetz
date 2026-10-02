import type { DriveFile } from '../integrations/drive/types'

/** Saran metadata yang SELALU berstatus saran — tidak pernah langsung menjadi field final. */
export interface SuggestedFields {
  documentName?: string
  categoryName?: string
  documentNumber?: string
  divisionName?: string
  picName?: string
  securityLevel?: number
  effectiveDate?: string
  expiryDate?: string
  summary?: string
  /** 0–1, keyakinan saran (AI); heuristik = rendah. */
  confidence?: number
}

const CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/\b(izin|ijin)\s*(operasional|usaha)?\b|\bnib\b|\bsiup\b/i, 'Izin Operasional'],
  [/\bsip\b|surat izin praktik/i, 'SIP'],
  [/\bstr\b|surat tanda registrasi/i, 'STR'],
  [/\bmou\b|nota kesepahaman/i, 'MoU'],
  [/\b(sewa|lease)\b/i, 'Sewa'],
  [/\b(kontrak|perjanjian|pks|agreement)\b/i, 'Kontrak'],
  [/\b(sertifikat|certificate|akreditasi)\b/i, 'Sertifikat'],
]

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', mei: '05', may: '05', jun: '06', jul: '07', agu: '08', aug: '08', sep: '09', okt: '10', oct: '10', nov: '11', des: '12', dec: '12' }

function findDates(s: string): string[] {
  const out: string[] = []
  for (const m of s.matchAll(/\b(20\d{2})[-_.](\d{2})[-_.](\d{2})\b/g)) out.push(`${m[1]}-${m[2]}-${m[3]}`)
  for (const m of s.matchAll(/\b(\d{2})[-_.](\d{2})[-_.](20\d{2})\b/g)) out.push(`${m[3]}-${m[2]}-${m[1]}`)
  for (const m of s.matchAll(/\b(\d{1,2})\s*(jan|feb|mar|apr|mei|may|jun|jul|agu|aug|sep|okt|oct|nov|des|dec)[a-z]*\s*(20\d{2})\b/gi))
    out.push(`${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`)
  return out.filter((d) => !Number.isNaN(Date.parse(d)))
}

/** Saran dari nama file + metadata Drive saja (dipakai untuk semua file, wajib untuk folder terbatas). */
export function suggestFromFilename(file: Pick<DriveFile, 'name' | 'path'>, restricted: boolean): SuggestedFields {
  const base = file.name.replace(/\.[a-z0-9]{2,5}$/i, '')
  const pretty = base.replace(/[_]+/g, ' ').replace(/\s+-\s+|\s{2,}/g, ' – ').replace(/\s+/g, ' ').trim()
  const haystack = `${file.path} ${base}`.replace(/[_-]+/g, ' ')
  const out: SuggestedFields = { documentName: pretty, securityLevel: restricted ? 3 : 2, confidence: 0.3 }
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(haystack)) {
      out.categoryName = cat
      break
    }
  }
  const spaced = base.replace(/_+/g, ' ')
  const dates = findDates(spaced)
  if (dates.length) {
    if (/\b(exp|expired|berlaku|sd|s\.d|until|habis)\b/i.test(spaced)) out.expiryDate = dates[dates.length - 1]
    else out.effectiveDate = dates[0]
  }
  const num = spaced.match(/\b(\d{2,4}\/[A-Z0-9.\/-]{2,30})\b/i)
  if (num) out.documentNumber = num[1]
  return out
}
