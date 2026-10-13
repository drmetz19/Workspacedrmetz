import { setDefaultPassword } from '@/server/services/users'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params }) => setDefaultPassword(ctx, params.id), {
  onSuccess: '/admin/users',
  successMessage: (r) => `Password ${r.email} direset ke password default divisi. Detail login dikirim ke emailnya.`,
})
