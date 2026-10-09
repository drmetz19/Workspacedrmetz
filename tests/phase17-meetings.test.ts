import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createActionItem, createMeetingMinutes, getMeetingDetail, getMeetingStats, listActionItems, listMeetings, updateActionItemStatus } from '@/server/services/meetings'
import { auditActions, closeDb, createUser, divisionId, resetDb } from './helpers'

beforeEach(resetDb)
afterAll(closeDb)

const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)

describe('Notulensi Rapat & Tindak Lanjut (Phase 17)', () => {
  it('Buat notulensi → tambah tindak lanjut → selesai; tercatat di audit & statistik', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const legal = await divisionId()
    const m = await createMeetingMinutes(owner, { divisionId: legal, title: 'Rapat Koordinasi', meetingDate: today(), attendees: 'dr. Metz, Tim Legal', summary: 'Bahas izin' })
    expect(m).toMatchObject({ divisionName: 'Legal/Perizinan', attendees: ['dr. Metz', 'Tim Legal'], status: 'DISAHKAN' })

    const a = await createActionItem(owner, { minutesId: m.minutesId, description: 'Siapkan draft perpanjangan SIP' })
    expect(a).toMatchObject({ divisionId: legal, minutesTitle: 'Rapat Koordinasi', status: 'BELUM_MULAI' })
    expect((await getMeetingStats(owner)).activeActionItems).toBe(1)

    const done = await updateActionItemStatus(owner, a.actionItemId, { status: 'SELESAI' })
    expect(done.status).toBe('SELESAI')
    expect(done.completedAt).not.toBeNull()
    expect((await getMeetingDetail(owner, m.minutesId)).actionItems).toHaveLength(1)
    expect((await getMeetingStats(owner)).activeActionItems).toBe(0)
    expect((await auditActions()).map((x) => x.action)).toEqual(expect.arrayContaining(['MEETING_MINUTES_CREATED', 'ACTION_ITEM_CREATED', 'ACTION_ITEM_STATUS_CHANGED']))
  })

  it('Division User hanya melihat & mengelola notulensi divisinya sendiri', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const stafLegal = await createUser()
    const stafHrd = await createUser({ division: 'HRD' })
    const m = await createMeetingMinutes(owner, { divisionId: await divisionId(), title: 'Rapat Legal', meetingDate: today(), summary: 'Rahasia legal' })

    expect(await listMeetings(stafLegal)).toHaveLength(1)
    expect(await listMeetings(stafHrd)).toHaveLength(0)
    await expect(getMeetingDetail(stafHrd, m.minutesId)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    await expect(createMeetingMinutes(stafHrd, { divisionId: await divisionId(), title: 'Nyusup', meetingDate: today(), summary: 'x x x' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    await expect(createActionItem(stafHrd, { minutesId: m.minutesId, description: 'Nyusup' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    expect(await listActionItems(stafHrd)).toHaveLength(0)
  })

  it('Tindak lanjut tanpa notulensi wajib punya divisi', async () => {
    const owner = await createUser({ role: 'OWNER' })
    await expect(createActionItem(owner, { description: 'Tanpa divisi' })).rejects.toMatchObject({ code: 'VALIDATION' })
    const hrd = await divisionId('HRD')
    expect(await createActionItem(owner, { divisionId: hrd, description: 'Rekap absensi' })).toMatchObject({ divisionId: hrd, minutesId: null })
  })
})
