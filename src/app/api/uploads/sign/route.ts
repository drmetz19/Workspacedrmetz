import { prepareDocumentUpload } from '@/server/services/uploads'
import { handler } from '@/server/http'

/**
 * POST /api/uploads/sign { fileName, mimeType, size } → { path, uploadUrl }
 * Browser lalu mengunggah langsung ke penyimpanan (PUT uploadUrl) dan mengirim `uploadPath` bersama form dokumen.
 */
export const POST = handler(async ({ ctx, body }) => prepareDocumentUpload(ctx, body))
