/**
 * Kontrak provider AI. Business logic TIDAK memanggil vendor langsung — selalu lewat orchestrator
 * (src/server/ai/orchestrator.ts) yang memakai kontrak ini. Ganti provider = ganti implementasi, bukan service.
 */
export interface AiRequest {
  /** Nama tugas untuk logging/telemetri, mis. "suggest_metadata", "answer_search". */
  task: string
  system: string
  prompt: string
  maxTokens?: number
  /** Minta keluaran JSON murni. */
  json?: boolean
}

export interface AiResponse {
  text: string
  provider: string
}

export interface AiProvider {
  readonly name: string
  isConfigured(): boolean
  generate(req: AiRequest): Promise<AiResponse>
}

export class AiUnavailableError extends Error {
  constructor(message = 'Layanan AI sementara tidak tersedia.') {
    super(message)
    this.name = 'AiUnavailableError'
  }
}
