import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db'
import {
  cancelOrder, createBranch, createOrder, decideOrder, getOrder, getPublicBranch, listBranches, listOrders, lookupPublicOrder,
  recordMovement, recordPublicMovement, regenerateBranchLink, setBranchPin, submitPublicOrder,
} from '@/server/services/orders'
import { auditActions, closeDb, createUser, resetDb } from './helpers'

beforeEach(resetDb)
afterAll(closeDb)

const items = JSON.stringify([{ itemName: 'Sarung tangan latex', qty: 10, unit: 'box' }, { itemName: 'Masker medis', qty: 5, unit: 'box' }])

async function setup() {
  const owner = await createUser({ role: 'OWNER' })
  const branches = await listBranches(owner)
  const bhy = branches.find((b) => b.branchCode === 'BHY')!
  await setBranchPin(owner, bhy.branchId, { pin: 'Kode1234' })
  const pscm = await createUser({ role: 'DIVISION_USER', division: 'Supply Chain' })
  return { owner, pscm, bhy }
}

const publicOrder = (token: string, over: Record<string, unknown> = {}) =>
  submitPublicOrder({ token, pin: 'Kode1234', requesterName: 'Sari', requesterContact: '0812', itemsJson: items, ...over })

describe('cabang & PIN', () => {
  it('Bhayangkara dan Cibadak tersedia; link publik dikenali', async () => {
    const { bhy } = await setup()
    expect(await getPublicBranch(bhy.publicToken)).toMatchObject({ branchName: 'Bhayangkara', ready: true })
    expect(await getPublicBranch('0'.repeat(32))).toBeNull()
    expect(await getPublicBranch('bukan-token')).toBeNull()
  })

  it('hanya PSCM/Owner/GM yang mengelola cabang', async () => {
    const { bhy } = await setup()
    const staf = await createUser({ role: 'DIVISION_USER', division: 'Legal/Perizinan' })
    await expect(listBranches(staf)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    await expect(setBranchPin(staf, bhy.branchId, { pin: 'abcd1234' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    await expect(createBranch(staf, { branchName: 'Baru', branchCode: 'BRU' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })

  it('PSCM menambah cabang baru; kode ganda ditolak; PIN terlalu pendek ditolak', async () => {
    const { pscm, bhy } = await setup()
    const b = await createBranch(pscm, { branchName: 'Sukabumi', branchCode: 'skb' })
    expect(b.branchCode).toBe('SKB')
    await expect(createBranch(pscm, { branchName: 'Lain', branchCode: 'SKB' })).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(setBranchPin(pscm, bhy.branchId, { pin: '12' })).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('mengganti link membuat link lama tidak berlaku', async () => {
    const { pscm, bhy } = await setup()
    const n = await regenerateBranchLink(pscm, bhy.branchId)
    expect(n.publicToken).not.toBe(bhy.publicToken)
    expect(await getPublicBranch(bhy.publicToken)).toBeNull()
    await expect(publicOrder(bhy.publicToken)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('formulir pesanan tanpa login', () => {
  it('PIN benar membuat pesanan bernomor SP/KODE/TAHUN/urut; nomor bertambah', async () => {
    const { bhy, owner } = await setup()
    const a = await publicOrder(bhy.publicToken)
    const b = await publicOrder(bhy.publicToken, { requesterName: 'Budi' })
    const year = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 4)
    expect(a.poNumber).toBe(`SP/BHY/${year}/0001`)
    expect(b.poNumber).toBe(`SP/BHY/${year}/0002`)
    expect(a.branchName).toBe('Bhayangkara')
    const list = await listOrders(owner)
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ status: 'MENUNGGU', source: 'FORM_PUBLIK', branchName: 'Bhayangkara' })
    expect((await auditActions({ action: 'PO_CREATED' })).length).toBe(2)
  })

  it('PIN salah ditolak, dan 5 kali salah mengunci cabang sementara', async () => {
    const { bhy } = await setup()
    for (let i = 0; i < 5; i++) await expect(publicOrder(bhy.publicToken, { pin: 'salah' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    await expect(publicOrder(bhy.publicToken)).rejects.toMatchObject({ code: 'LOCKED' })
    expect((await auditActions({ action: 'BRANCH_PIN_FAILED' })).length).toBe(5)
  })

  it('PSCM mengatur ulang PIN membuka kunci', async () => {
    const { bhy, pscm } = await setup()
    for (let i = 0; i < 5; i++) await publicOrder(bhy.publicToken, { pin: 'salah' }).catch(() => null)
    await setBranchPin(pscm, bhy.branchId, { pin: 'Baru5678' })
    expect(await publicOrder(bhy.publicToken, { pin: 'Baru5678' })).toHaveProperty('poNumber')
  })

  it('cabang tanpa PIN belum bisa dipakai; validasi isian', async () => {
    const { bhy, owner } = await setup()
    const cbd = (await listBranches(owner)).find((b) => b.branchCode === 'CBD')!
    await expect(publicOrder(cbd.publicToken)).rejects.toMatchObject({ code: 'UNAVAILABLE' })
    await expect(publicOrder(bhy.publicToken, { itemsJson: '[]' })).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(publicOrder(bhy.publicToken, { itemsJson: 'bukan json' })).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(publicOrder(bhy.publicToken, { requesterName: '' })).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(publicOrder(bhy.publicToken, { itemsJson: JSON.stringify([{ itemName: 'X barang', qty: 0 }]) })).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})

describe('persetujuan PSCM', () => {
  it('PSCM menyetujui; pesanan non-PSCM ditolak; sudah diproses tidak bisa diubah', async () => {
    const { bhy, pscm } = await setup()
    const { poNumber } = await publicOrder(bhy.publicToken)
    const [po] = await listOrders(pscm)
    const staf = await createUser({ role: 'DIVISION_USER', division: 'Legal/Perizinan' })
    await expect(decideOrder(staf, po.poId, { decision: 'SETUJUI' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    const ok = await decideOrder(pscm, po.poId, { decision: 'SETUJUI', supplierName: 'PT Medika' })
    expect(ok).toMatchObject({ poNumber, status: 'DISETUJUI', supplierName: 'PT Medika', decidedByName: pscm.name })
    await expect(decideOrder(pscm, po.poId, { decision: 'TOLAK', note: 'x' })).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('penolakan wajib alasan', async () => {
    const { bhy, pscm } = await setup()
    await publicOrder(bhy.publicToken)
    const [po] = await listOrders(pscm)
    await expect(decideOrder(pscm, po.poId, { decision: 'TOLAK' })).rejects.toMatchObject({ code: 'VALIDATION' })
    expect((await decideOrder(pscm, po.poId, { decision: 'TOLAK', note: 'Stok vendor kosong' })).status).toBe('DITOLAK')
  })
})

describe('pesanan lewat aplikasi (login)', () => {
  it('user login membuat pesanan; hanya melihat miliknya, PSCM melihat semua', async () => {
    const { pscm, bhy } = await setup()
    const a = await createUser({ role: 'DIVISION_USER', division: 'Operasional' })
    const b = await createUser({ role: 'DIVISION_USER', division: 'Operasional' })
    const po = await createOrder(a, { branchId: bhy.branchId, itemsJson: items })
    expect(po).toMatchObject({ source: 'APLIKASI', requesterName: a.name, status: 'MENUNGGU' })
    expect(await listOrders(a)).toHaveLength(1)
    expect(await listOrders(b)).toHaveLength(0)
    expect(await listOrders(pscm)).toHaveLength(1)
    await expect(getOrder(b, po.poId)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    expect((await cancelOrder(a, po.poId)).status).toBe('DIBATALKAN')
  })
})

describe('barang masuk / keluar', () => {
  async function approved() {
    const ctx = await setup()
    const { poNumber } = await publicOrder(ctx.bhy.publicToken)
    const [po] = await listOrders(ctx.pscm)
    await decideOrder(ctx.pscm, po.poId, { decision: 'SETUJUI' })
    const detail = await getOrder(ctx.pscm, po.poId)
    return { ...ctx, poNumber, po: detail, ids: detail.items!.map((i) => i.itemId) }
  }

  it('cabang mencatat penerimaan via formulir publik: sebagian lalu lengkap', async () => {
    const { bhy, poNumber, po, ids, pscm } = await approved()
    const found = await lookupPublicOrder({ token: bhy.publicToken, pin: 'Kode1234', poNumber: poNumber.toLowerCase() })
    expect(found.items).toHaveLength(2)

    await recordPublicMovement({
      token: bhy.publicToken, pin: 'Kode1234', poNumber, direction: 'MASUK', recordedByName: 'Sari',
      linesJson: JSON.stringify([{ itemId: ids[0], qty: 4 }, { itemId: ids[1], qty: 0 }]),
    })
    let d = await getOrder(pscm, po.poId)
    expect(d.status).toBe('SEBAGIAN_DITERIMA')
    expect(d.items![0]).toMatchObject({ received: 4 })

    await recordPublicMovement({
      token: bhy.publicToken, pin: 'Kode1234', poNumber, direction: 'MASUK', recordedByName: 'Sari',
      linesJson: JSON.stringify([{ itemId: ids[0], qty: 6 }, { itemId: ids[1], qty: 5 }]),
    })
    d = await getOrder(pscm, po.poId)
    expect(d.status).toBe('DITERIMA')
    expect(d.movements).toHaveLength(3)
    expect(d.movements![0].source).toBe('FORM_PUBLIK')
  })

  it('jumlah diterima tidak boleh melebihi pesanan; nama pencatat wajib', async () => {
    const { bhy, poNumber, ids } = await approved()
    const base = { token: bhy.publicToken, pin: 'Kode1234', poNumber, direction: 'MASUK' }
    await expect(recordPublicMovement({ ...base, recordedByName: 'Sari', linesJson: JSON.stringify([{ itemId: ids[0], qty: 11 }]) })).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(recordPublicMovement({ ...base, recordedByName: '', linesJson: JSON.stringify([{ itemId: ids[0], qty: 1 }]) })).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(recordPublicMovement({ ...base, recordedByName: 'Sari', linesJson: JSON.stringify([{ itemId: ids[0], qty: 0 }]) })).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('pesanan belum disetujui / cabang lain tidak bisa dicatat', async () => {
    const { bhy, owner, pscm } = await setup()
    const { poNumber } = await publicOrder(bhy.publicToken)
    await expect(lookupPublicOrder({ token: bhy.publicToken, pin: 'Kode1234', poNumber })).rejects.toMatchObject({ code: 'CONFLICT' })
    const [po] = await listOrders(pscm)
    await decideOrder(pscm, po.poId, { decision: 'SETUJUI' })
    const cbd = (await listBranches(owner)).find((b) => b.branchCode === 'CBD')!
    await setBranchPin(owner, cbd.branchId, { pin: 'Cbd12345' })
    await expect(lookupPublicOrder({ token: cbd.publicToken, pin: 'Cbd12345', poNumber })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('PSCM di aplikasi mencatat barang keluar tanpa mengubah status penerimaan', async () => {
    const { pscm, po, ids } = await approved()
    const d = await recordMovement(pscm, po.poId, { direction: 'KELUAR', linesJson: JSON.stringify([{ itemId: ids[0], qty: 3 }]) })
    expect(d.status).toBe('DISETUJUI')
    expect(d.items![0]).toMatchObject({ sent: 3, received: 0 })
    expect((await auditActions({ action: 'GOODS_SENT' })).length).toBe(1)
    const staf = await createUser({ role: 'DIVISION_USER', division: 'Legal/Perizinan' })
    await expect(recordMovement(staf, po.poId, { direction: 'MASUK', linesJson: '[]' })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })

  it('tabel pesanan tidak bisa dibaca role aplikasi biasa (RLS tertutup)', async () => {
    const rows = await db()<{ relrowsecurity: boolean }[]>`select relrowsecurity from pg_class where relname in ('branches','purchase_orders','purchase_order_items','goods_movements','po_counters')`
    expect(rows).toHaveLength(5)
    expect(rows.every((r) => r.relrowsecurity)).toBe(true)
  })
})
