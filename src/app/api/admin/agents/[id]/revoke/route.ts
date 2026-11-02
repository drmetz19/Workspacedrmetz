import { revokeAgentToken } from '@/server/services/agents'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params }) => revokeAgentToken(ctx, params.id), {
  onSuccess: '/admin/agents',
  successMessage: (t) => `Token "${t.name}" dicabut. Agent tidak bisa masuk lagi.`,
})
