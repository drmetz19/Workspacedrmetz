import { getDocumentHistory } from '@/server/services/documents'
import { handler } from '@/server/http'

export const GET = handler(async ({ ctx, params }) => getDocumentHistory(ctx, params.id))
