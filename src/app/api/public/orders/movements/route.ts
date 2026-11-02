import { recordPublicMovement } from '@/server/services/orders'
import { handler } from '@/server/http'

export const POST = handler(async ({ body }) => recordPublicMovement(body), { auth: false })
