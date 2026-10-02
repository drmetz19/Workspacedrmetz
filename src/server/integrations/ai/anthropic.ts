import { AiUnavailableError, type AiProvider } from './types'

/** Provider Anthropic (Claude) via Messages API. Env: ANTHROPIC_API_KEY, AI_MODEL (default claude-sonnet-5-5). */
export const anthropicProvider: AiProvider = {
  get name() {
    return `anthropic:${process.env.AI_MODEL || 'claude-sonnet-5-5'}`
  },
  isConfigured: () => !!process.env.ANTHROPIC_API_KEY,
  async generate(req) {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) throw new AiUnavailableError('ANTHROPIC_API_KEY belum di-set.')
    const model = process.env.AI_MODEL || 'claude-sonnet-5-5'
    let res: Response
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens ?? 1024,
          system: req.system,
          messages: [{ role: 'user', content: req.prompt }],
        }),
        signal: AbortSignal.timeout(45_000),
      })
    } catch {
      throw new AiUnavailableError()
    }
    if (!res.ok) throw new AiUnavailableError(`Layanan AI menolak permintaan (${res.status}).`)
    const body = (await res.json()) as { content: { type: string; text?: string }[] }
    const text = body.content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
    return { text, provider: this.name }
  },
}
