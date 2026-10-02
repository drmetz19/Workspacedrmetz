import { listCategories } from '@/server/services/org'
import { handler } from '@/server/http'

export const GET = handler(async ({ ctx }) => listCategories(ctx))
