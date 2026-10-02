import { deactivateUser } from '@/server/services/users'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params }) => deactivateUser(ctx, params.id), {
  onSuccess: '/admin/users',
  successMessage: 'User dinonaktifkan.',
})
