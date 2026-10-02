import { askDocuments } from '@/server/services/ask'
import { handler } from '@/server/http'

/** POST /api/ask { question } → { answer, found, citations[], permissionScopeApplied } */
export const POST = handler(async ({ ctx, body }) => askDocuments(ctx, { question: body.question }))
