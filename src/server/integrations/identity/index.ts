import { config } from '../../config'
import { localIdentityProvider } from './local'
import { supabaseIdentityProvider } from './supabase'
import type { IdentityProvider } from './types'

let override: IdentityProvider | null = null

export function identityProvider(): IdentityProvider {
  if (override) return override
  return config.identityProvider === 'supabase' ? supabaseIdentityProvider : localIdentityProvider
}

/** Untuk test: ganti provider. */
export function setIdentityProviderForTest(p: IdentityProvider | null) {
  override = p
}

export type { IdentityProvider } from './types'
