import { reactivateUser } from '@/server/services/users'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params }) => reactivateUser(ctx, params.id), {
  onSuccess: '/admin/users',
  successMessage: 'User diaktifkan kembali.',
})
