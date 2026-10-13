import { setDefaultPasswordsForPending } from '@/server/services/users'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx }) => setDefaultPasswordsForPending(ctx), {
  onSuccess: '/admin/users',
  successMessage: (r) => r.count ? `${r.count} akun divisi siap dipakai dengan password default. Detail login dikirim ke email masing-masing.` : 'Tidak ada Division User yang menunggu.',
})
