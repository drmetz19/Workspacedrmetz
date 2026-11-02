import { lookupPublicOrder } from '@/server/services/orders'
import { handler } from '@/server/http'

export const POST = handler(async ({ body }) => lookupPublicOrder(body), { auth: false })
