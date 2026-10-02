import { googleDriveAdapter } from './google'
import { mockDriveAdapter } from './mock'
import type { DriveAdapter } from './types'

let override: DriveAdapter | null = null

/** DRIVE_PROVIDER=google (produksi) | mock (pengembangan/test). */
export function driveAdapter(): DriveAdapter {
  if (override) return override
  return process.env.DRIVE_PROVIDER === 'google' ? googleDriveAdapter : mockDriveAdapter
}

export function setDriveAdapterForTest(a: DriveAdapter | null) {
  override = a
}

export * from './types'
