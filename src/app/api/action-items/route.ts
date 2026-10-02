import { createActionItem } from '@/server/services/meetings'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, body }) => createActionItem(ctx, body), {
  successMessage: 'Tindak lanjut ditambahkan.',
})
