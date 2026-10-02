import { anthropicProvider } from './anthropic'
import { mockAiProvider } from './mock'
import type { AiProvider } from './types'

let override: AiProvider | null = null

const disabled: AiProvider = {
  name: 'none',
  isConfigured: () => false,
  generate: async () => {
    const { AiUnavailableError } = await import('./types')
    throw new AiUnavailableError('AI belum dikonfigurasi.')
  },
}

/** AI_PROVIDER = anthropic | mock | none. */
export function aiProvider(): AiProvider {
  if (override) return override
  switch (process.env.AI_PROVIDER) {
    case 'anthropic':
      return anthropicProvider
    case 'mock':
      return mockAiProvider
    default:
      return disabled
  }
}

export function setAiProviderForTest(p: AiProvider | null) {
  override = p
}

export * from './types'
