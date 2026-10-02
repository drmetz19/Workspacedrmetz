import { listDivisions } from '@/server/services/org'
import { handler } from '@/server/http'

export const GET = handler(async ({ ctx }) => listDivisions(ctx))
