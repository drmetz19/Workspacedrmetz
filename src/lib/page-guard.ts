import { isServiceError } from '@/server/errors'
import { notFound } from 'next/navigation'

export type Guarded<T> = { ok: true; data: T } | { ok: false; code: string; message: string }

/** Menjalankan pemanggilan service untuk halaman; ACCESS_DENIED dikembalikan sebagai nilai agar bisa dirender. */
export async function guard<T>(fn: () => Promise<T>): Promise<Guarded<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    if (isServiceError(e)) {
      if (e.code === 'NOT_FOUND') notFound()
      return { ok: false, code: e.code, message: e.message }
    }
    throw e
  }
}
