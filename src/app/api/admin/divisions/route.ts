import { createDivision } from '@/server/services/org'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, body }) => createDivision(ctx, body), {
  onSuccess: '/admin/divisions',
  successMessage: (d) => `Divisi ${d.divisionName} dibuat.`,
})
