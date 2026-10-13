import { changeDefaultPassword } from '@/server/services/auth'
import { ServiceError } from '@/server/errors'
import { handler } from '@/server/http'

export const POST = handler(
  async ({ ctx, body }) => {
    if (body.confirm !== undefined && body.confirm !== body.password) throw new ServiceError('VALIDATION', 'Konfirmasi password tidak sama.')
    await changeDefaultPassword(ctx, String(body.password ?? ''))
  },
  { allowMustChangePassword: true, onSuccess: '/', successMessage: 'Password baru tersimpan. Selamat datang!', onError: '/change-password' },
)
