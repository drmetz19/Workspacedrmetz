import { inviteUser, listUsers } from '@/server/services/users'
import { handler } from '@/server/http'

export const GET = handler(async ({ ctx }) => listUsers(ctx))

export const POST = handler(
  async ({ ctx, body }) => inviteUser(ctx, { email: body.email, name: body.name, roleId: body.roleId, divisionId: body.divisionId }),
  { onSuccess: '/admin/users', successMessage: (u) => `Undangan terkirim ke ${u.email}.` },
)
