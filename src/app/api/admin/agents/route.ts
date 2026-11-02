import { createAgentToken } from '@/server/services/agents'
import { handler } from '@/server/http'

/** Dipanggil klien dengan Accept: application/json; token polos hanya ada di respons ini. */
export const POST = handler(async ({ ctx, body }) => createAgentToken(ctx, body), { onSuccess: '/admin/agents' })
