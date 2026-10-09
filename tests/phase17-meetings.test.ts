import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createActionItem,
  createMeetingMinutes,
  getMeetingDetail,
  getMeetingStats,
  listActionItems,
  listMeetings,
  myActionItems,
  updateActionItemStatus,
} from '@/server/services/meetings'
import { todayJakarta } from '@/server/services/search'
import { auditActions, closeDb, createUser, divisionId, resetDb } from './helpers'

beforeEach(resetDb)
afterAll(closeDb)

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

describe('Notulensi Rapat', () => {
  it('Staf membuat notulensi divisinya; peserta dipecah per koma/baris; diaudit', async () => {
    const staf = await createUser({ division: 'Legal/Perizinan' })
    const m = await createMeetingMinutes(staf, {
      divisionId: await divisionId(),
      title: 'Rapat Perpanjangan Izin',
      meetingDate: '2026-10-01',
      attendees: 'dr. Metz, Budi\nSari',
      summary: 'Membahas perpanjangan izin operasional.',
    })
    expect(m).toMatchObject({ title: 'Rapat Perpanjangan Izin', meetingType: 'INTERNAL', status: 'DISAHKAN', actionItemCount: 0 })
    expect(m.attendees).toEqual(['dr. Metz', 'Budi', 'Sari'])
    const audit = await auditActions({ action: 'MEETING_MINUTES_CREATED' })
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ result: 'SUCCESS', resource_id: m.minutesId })
  })

  it('Staf tidak bisa membuat notulensi untuk divisi lain (ditolak & diaudit)', async () => {
    const staf = await createUser({ division: 'Legal/Perizinan' })
    await expect(
      createMeetingMinutes(staf, { divisionId: await divisionId('Keuangan'), title: 'Rapat Pajak', meetingDate: '2026-10-01', summary: 'Pajak tahunan' }),
    ).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    expect(await auditActions({ action: 'MEETING_MINUTES_CREATED' })).toMatchObject([{ result: 'DENIED' }])
  })

  it('Validasi: judul pendek, tanggal salah, tautan bukan http ditolak', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const div = await divisionId()
    const base = { divisionId: div, title: 'Rapat Bulanan', meetingDate: '2026-10-01', summary: 'Ringkasan rapat' }
    await expect(createMeetingMinutes(owner, { ...base, title: 'ab' })).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(createMeetingMinutes(owner, { ...base, meetingDate: '01/10/2026' })).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(createMeetingMinutes(owner, { ...base, driveUrl: 'javascript:alert(1)' })).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('Daftar & detail dibatasi divisi: staf hanya melihat divisinya, Owner melihat semua', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const gm = await createUser({ role: 'GM', division: null })
    const staf = await createUser({ division: 'Legal/Perizinan' })
    const legal = await createMeetingMinutes(owner, { divisionId: await divisionId(), title: 'Rapat Legal', meetingDate: '2026-10-01', summary: 'Legal' })
    const keu = await createMeetingMinutes(owner, { divisionId: await divisionId('Keuangan'), title: 'Rapat Keuangan', meetingDate: '2026-10-02', summary: 'Keuangan' })

    expect((await listMeetings(owner)).map((m) => m.title)).toEqual(['Rapat Keuangan', 'Rapat Legal'])
    expect((await listMeetings(gm)).map((m) => m.title)).toEqual(['Rapat Keuangan', 'Rapat Legal'])
    expect((await listMeetings(staf)).map((m) => m.title)).toEqual(['Rapat Legal'])

    const detail = await getMeetingDetail(staf, legal.minutesId)
    expect(detail).toMatchObject({ canManage: true, meeting: { title: 'Rapat Legal' } })
    await expect(getMeetingDetail(staf, keu.minutesId)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    expect(await auditActions({ action: 'ACCESS_DENIED' })).toMatchObject([{ result: 'DENIED', resource_id: keu.minutesId }])
    await expect(getMeetingDetail(owner, '00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('Tindak Lanjut', () => {
  it('Tindak lanjut dari notulensi mewarisi divisinya; status berubah & diaudit', async () => {
    const staf = await createUser({ division: 'Legal/Perizinan' })
    const m = await createMeetingMinutes(staf, { divisionId: await divisionId(), title: 'Rapat Izin', meetingDate: '2026-10-01', summary: 'Izin' })
    const item = await createActionItem(staf, { minutesId: m.minutesId, description: 'Kirim berkas ke dinas', picUserId: staf.userId })
    expect(item).toMatchObject({ minutesId: m.minutesId, minutesTitle: 'Rapat Izin', divisionId: m.divisionId, status: 'BELUM_MULAI', picName: staf.name })

    const detail = await getMeetingDetail(staf, m.minutesId)
    expect(detail.meeting).toMatchObject({ actionItemCount: 1, openActionItemCount: 1 })
    expect(detail.actionItems.map((a) => a.actionItemId)).toEqual([item.actionItemId])

    const done = await updateActionItemStatus(staf, item.actionItemId, { status: 'SELESAI' })
    expect(done.status).toBe('SELESAI')
    expect(done.completedAt).toBeInstanceOf(Date)
    const reopened = await updateActionItemStatus(staf, item.actionItemId, { status: 'BERJALAN' })
    expect(reopened.completedAt).toBeNull()
    expect((await getMeetingDetail(staf, m.minutesId)).meeting.openActionItemCount).toBe(1)

    const audit = await auditActions({ action: 'ACTION_ITEM_STATUS_CHANGED' })
    expect(audit.map((a) => a.metadata)).toEqual([{ from: 'BELUM_MULAI', to: 'SELESAI' }, { from: 'SELESAI', to: 'BERJALAN' }])
  })

  it('Tindak lanjut tanpa notulensi wajib divisi; divisi lain ditolak', async () => {
    const staf = await createUser({ division: 'Legal/Perizinan' })
    await expect(createActionItem(staf, { description: 'Tanpa divisi' })).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(createActionItem(staf, { divisionId: await divisionId('Keuangan'), description: 'Bayar pajak' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    const ok = await createActionItem(staf, { divisionId: await divisionId(), description: 'Cek SIP dokter' })
    expect(ok.minutesId).toBeNull()
  })

  it('Staf tidak bisa melihat atau mengubah tindak lanjut divisi lain', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const staf = await createUser({ division: 'Legal/Perizinan' })
    const keu = await createActionItem(owner, { divisionId: await divisionId('Keuangan'), description: 'Rekap kas' })
    await createActionItem(owner, { divisionId: await divisionId(), description: 'Rekap izin' })

    expect((await listActionItems(staf)).map((a) => a.description)).toEqual(['Rekap izin'])
    expect(await listActionItems(owner)).toHaveLength(2)
    await expect(updateActionItemStatus(staf, keu.actionItemId, { status: 'SELESAI' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    expect(await auditActions({ action: 'ACTION_ITEM_STATUS_CHANGED' })).toMatchObject([{ result: 'DENIED' }])
  })

  it('Tindak lanjut saya: hanya PIC saya & yang belum selesai', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const staf = await createUser({ division: 'Legal/Perizinan' })
    const div = await divisionId()
    const a = await createActionItem(owner, { divisionId: div, description: 'Tugas staf 1', picUserId: staf.userId })
    const b = await createActionItem(owner, { divisionId: div, description: 'Tugas staf 2', picUserId: staf.userId })
    await createActionItem(owner, { divisionId: div, description: 'Tugas owner', picUserId: owner.userId })
    await updateActionItemStatus(owner, b.actionItemId, { status: 'SELESAI' })
    expect((await myActionItems(staf)).map((x) => x.actionItemId)).toEqual([a.actionItemId])
  })

  it('Statistik: aktif, jatuh tempo minggu ini, notulensi bulan ini, kepatuhan', async () => {
    const owner = await createUser({ role: 'OWNER' })
    const staf = await createUser({ division: 'Legal/Perizinan' })
    const today = todayJakarta()
    const legal = await divisionId()
    const keu = await divisionId('Keuangan')

    expect(await getMeetingStats(owner)).toEqual({ activeActionItems: 0, dueThisWeek: 0, minutesThisMonth: 0, complianceRate: 100 })

    await createMeetingMinutes(owner, { divisionId: legal, title: 'Rapat bulan ini', meetingDate: today, summary: 'x x x' })
    await createMeetingMinutes(owner, { divisionId: keu, title: 'Rapat bulan ini Keu', meetingDate: today, summary: 'x x x' })
    await createMeetingMinutes(owner, { divisionId: legal, title: 'Rapat lama', meetingDate: addDays(today, -400), summary: 'x x x' })

    await createActionItem(owner, { divisionId: legal, description: 'Jatuh tempo 3 hari', dueDate: addDays(today, 3) })
    await createActionItem(owner, { divisionId: legal, description: 'Jatuh tempo 30 hari', dueDate: addDays(today, 30) })
    const late = await createActionItem(owner, { divisionId: legal, description: 'Lewat tempo, selesai', dueDate: addDays(today, -2) })
    await updateActionItemStatus(owner, late.actionItemId, { status: 'SELESAI' })
    await createActionItem(owner, { divisionId: keu, description: 'Lewat tempo Keu, belum', dueDate: addDays(today, -1) })

    expect(await getMeetingStats(owner)).toEqual({ activeActionItems: 3, dueThisWeek: 1, minutesThisMonth: 2, complianceRate: 50 })
    // Staf Legal: item Keuangan tidak dihitung
    expect(await getMeetingStats(staf)).toEqual({ activeActionItems: 2, dueThisWeek: 1, minutesThisMonth: 1, complianceRate: 100 })
  })
})
