import { changeSecurityLevel } from '@/server/services/permissions'
import { handler } from '@/server/http'

export const POST = handler(async ({ ctx, params, body }) => ({ documentId: params.id, result: await changeSecurityLevel(ctx, params.id, body.securityLevel) }), {
  onSuccess: (r) => `/documents/${r.documentId}`,
  successMessage: (r) =>
    r.result?.needsRestrictedStorage
      ? `Level diubah ke L${r.result.to}. Pindahkan file ke Shared Drive terbatas agar tidak bisa dibuka langsung dari Drive.`
      : 'Level keamanan disimpan.',
})
