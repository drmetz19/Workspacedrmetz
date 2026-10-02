import { updateDivision } from '@/server/services/org'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, body, params }) => updateDivision(ctx, params.id, body), {
  onSuccess: '/admin/divisions',
  successMessage: (d) => `Divisi ${d.divisionName} disimpan.`,
})
