import { inviteUser, listUsers } from '@/server/services/users'
import { handler } from '@/server/http'

export const GET = handler(async ({ ctx }) => listUsers(ctx))

export const POST = handler(
  async ({ ctx, body }) => inviteUser(ctx, { email: body.email, name: body.name, roleId: body.roleId, divisionId: body.divisionId, loginMode: body.loginMode }),
  {
    onSuccess: '/admin/users',
    successMessage: (u) => u.defaultPassword
      ? `Akun ${u.email} siap — langsung masuk dengan email & password default divisi. Detail login juga dikirim ke emailnya.`
      : `Undangan terkirim ke ${u.email}.`,
  },
)
