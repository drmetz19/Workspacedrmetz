import { scanSource } from '@/server/services/sources'
import { handler, safeReturnTo } from '@/server/http'

export const POST = handler(async ({ ctx, params, body }) => ({ stats: await scanSource(ctx, params.id), back: safeReturnTo(body.returnTo, '/admin/sources') }), {
  onSuccess: (r) => r.back,
  successMessage: (r) =>
    `Scan selesai: ${r.stats.found} file, ${r.stats.created} draft baru, ${r.stats.skipped} sudah terdaftar` +
    (r.stats.missing ? `, ${r.stats.missing} file hilang dari Drive` : '') + (r.stats.restored ? `, ${r.stats.restored} pulih` : '') + '.',
})
