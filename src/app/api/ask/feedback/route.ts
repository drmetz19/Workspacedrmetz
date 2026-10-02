import { recordAskFeedback } from '@/server/services/ask'
import { handler } from '@/server/http'

/** POST /api/ask/feedback { question, helpful: yes|no, returnTo } → audit AI_ANSWER_FEEDBACK, kembali ke percakapan. */
export const POST = handler(async ({ ctx, body }) => recordAskFeedback(ctx, { question: body.question, helpful: body.helpful }), {
  successMessage: (r) => (r.helpful ? 'Terima kasih — umpan balik dicatat.' : 'Terima kasih — kami catat bahwa jawaban belum membantu.'),
})
