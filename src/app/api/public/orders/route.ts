import { submitPublicOrder } from '@/server/services/orders'
import { handler } from '@/server/http'

/** Formulir pesanan cabang TANPA login (link rahasia cabang + PIN). Dipanggil klien dengan Accept: application/json. */
export const POST = handler(async ({ body }) => submitPublicOrder(body), { auth: false })
