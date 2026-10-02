import { updateUser } from '@/server/services/users'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, body, params }) => updateUser(ctx, params.id, body), {
  onSuccess: '/admin/users',
  successMessage: (u) => `Data ${u.name} disimpan.`,
})
