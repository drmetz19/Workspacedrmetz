import { requestPasswordReset } from '@/server/services/auth'
import { handler } from '@/server/http'

export const POST = handler(async ({ body }) => requestPasswordReset(String(body.email ?? '')), {
  auth: false,
  onSuccess: '/forgot-password',
  successMessage: 'Jika email terdaftar dan memakai password, tautan reset sudah dikirim.',
  onError: '/forgot-password',
})
