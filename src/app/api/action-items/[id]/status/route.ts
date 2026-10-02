import { updateActionItemStatus } from '@/server/services/meetings'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params, body }) => updateActionItemStatus(ctx, params.id, body), {
  successMessage: (a) => `Status "${a.description.slice(0, 40)}" diperbarui.`,
})
