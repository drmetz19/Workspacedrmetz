import { createMeetingMinutes, listMeetings } from '@/server/services/meetings'
import { handler } from '@/server/http'

export const GET = handler(async ({ ctx, body }) => listMeetings(ctx, { divisionId: body.divisionId as string | undefined }))

export const POST = handler(async ({ ctx, body }) => createMeetingMinutes(ctx, body), {
  onSuccess: (m) => `/meetings/${m.minutesId}`,
  successMessage: 'Notulensi rapat tersimpan.',
})
