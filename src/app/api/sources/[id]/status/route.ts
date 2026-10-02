import { setDriveSourceStatus } from '@/server/services/sources'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params, body }) => setDriveSourceStatus(ctx, params.id, body.status), {
  onSuccess: '/admin/sources',
  successMessage: 'Status sumber disimpan.',
})
