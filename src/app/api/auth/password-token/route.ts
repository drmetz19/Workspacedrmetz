import { completePasswordToken } from '@/server/services/auth'
import { ServiceError } from '@/server/errors'
import { handler } from '@/server/http'

export const POST = handler(
  async ({ body }) => {
    if (body.confirm !== undefined && body.confirm !== body.password) throw new ServiceError('VALIDATION', 'Konfirmasi password tidak sama.')
    await completePasswordToken(String(body.token ?? ''), String(body.password ?? ''))
  },
  { auth: false, onSuccess: '/login', successMessage: 'Password tersimpan. Silakan masuk.' },
)
