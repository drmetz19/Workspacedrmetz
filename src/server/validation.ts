import { z } from 'zod'
import { ServiceError } from './errors'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID_RE.test(s)

/** Validasi input service dengan zod; error → ServiceError VALIDATION dengan pesan pertama. */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input)
  if (!r.success) {
    const issue = r.error.issues[0]
    const field = issue.path.join('.')
    throw new ServiceError('VALIDATION', field ? `${field}: ${issue.message}` : issue.message, {
      issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  return r.data
}

export function requireUuid(id: unknown, what = 'id'): string {
  if (!isUuid(id)) throw new ServiceError('NOT_FOUND', `${what} tidak ditemukan.`)
  return id
}

/** String kosong → null; dipakai untuk field opsional dari form HTML. */
export const optionalText = z
  .string()
  .nullish()
  .transform((v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null))

export const optionalUuid = z
  .string()
  .nullish()
  .transform((v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null))
  .refine((v) => v === null || UUID_RE.test(v), 'harus berupa ID yang valid')

export const optionalDate = z
  .string()
  .nullish()
  .transform((v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'format tanggal YYYY-MM-DD')
