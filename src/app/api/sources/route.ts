import { createDriveSource, listDriveSources } from '@/server/services/sources'
import { handler } from '@/server/http'

export const GET = handler(async ({ ctx }) => listDriveSources(ctx))
export const POST = handler(async ({ ctx, body }) => createDriveSource(ctx, body), {
  onSuccess: '/admin/sources',
  successMessage: (s) => `Folder "${s.name}" terhubung. Jalankan scan untuk membuat draft.`,
})
