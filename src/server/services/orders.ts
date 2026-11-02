import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db, type Sql, type Tx } from '../db'
import { auditAs, recordAudit } from '../audit'
import { ServiceError } from '../errors'
import type { IdentityContext } from '../context'
import { optionalDate, optionalText, parseInput, requireUuid } from '../validation'
import { todayJakarta } from './search'

// ── Hak akses ───────────────────────────────────────────────────────────
/** PSCM = Owner, GM, dan staf divisi Supply Chain. */
export async function isProcurement(ctx: IdentityContext): Promise<boolean> {
  if (ctx.roleId === 'OWNER' || ctx.roleId === 'GM') return true
  if (!ctx.divisionId) return false
  const rows = await db()`select 1 from divisions where division_id = ${ctx.divisionId} and division_name = 'Supply Chain'`
  return rows.length > 0
}

async function requireProcurement(ctx: IdentityContext, action: string, resourceType = 'PURCHASE_ORDER', resourceId: string | null = null) {
  if (await isProcurement(ctx)) return
  await auditAs(ctx, { action, resourceType, resourceId, result: 'DENIED', metadata: { reason: 'PROCUREMENT_ONLY' } })
  throw new ServiceError('ACCESS_DENIED', 'Akses ditolak. Hanya PSCM (Supply Chain), GM, atau Owner yang dapat melakukan ini.')
}

// ── Tipe ────────────────────────────────────────────────────────────────
export type OrderStatus = 'MENUNGGU' | 'DISETUJUI' | 'DITOLAK' | 'SEBAGIAN_DITERIMA' | 'DITERIMA' | 'DIBATALKAN'
export type OrderSource = 'FORM_PUBLIK' | 'APLIKASI'
export type Direction = 'MASUK' | 'KELUAR'

export interface OrderItemDto {
  itemId: string
  lineNo: number
  itemName: string
  qty: number
  unit: string
  note: string | null
  received: number
  sent: number
}

export interface MovementDto {
  movementId: string
  itemName: string
  unit: string
  direction: Direction
  qty: number
  movedOn: string
  recordedByName: string
  source: OrderSource
  note: string | null
  createdAt: Date
}

export interface OrderDto {
  poId: string
  poNumber: string
  branchId: string
  branchName: string
  branchCode: string
  requesterName: string
  requesterContact: string | null
  neededDate: string | null
  notes: string | null
  supplierName: string | null
  status: OrderStatus
  source: OrderSource
  createdByName: string | null
  decidedByName: string | null
  decidedAt: Date | null
  decisionNote: string | null
  createdAt: Date
  itemCount: number
  items?: OrderItemDto[]
  movements?: MovementDto[]
}

type OrderRow = {
  po_id: string; po_number: string; branch_id: string; branch_name: string; branch_code: string
  requester_name: string; requester_contact: string | null; needed_date: string | null; notes: string | null
  supplier_name: string | null; status: OrderStatus; source: OrderSource; created_by: string | null
  created_by_name: string | null; decided_by_name: string | null; decided_at: Date | null; decision_note: string | null
  created_at: Date; item_count: number
}

const toOrder = (r: OrderRow): OrderDto => ({
  poId: r.po_id, poNumber: r.po_number, branchId: r.branch_id, branchName: r.branch_name, branchCode: r.branch_code,
  requesterName: r.requester_name, requesterContact: r.requester_contact, neededDate: r.needed_date, notes: r.notes,
  supplierName: r.supplier_name, status: r.status, source: r.source, createdByName: r.created_by_name,
  decidedByName: r.decided_by_name, decidedAt: r.decided_at, decisionNote: r.decision_note, createdAt: r.created_at,
  itemCount: r.item_count,
})

const orderSelect = (q: Sql | Tx) => q`
  select o.po_id, o.po_number, o.branch_id, b.branch_name, b.branch_code, o.requester_name, o.requester_contact,
    o.needed_date, o.notes, o.supplier_name, o.status, o.source, o.created_by, cu.name as created_by_name,
    du.name as decided_by_name, o.decided_at, o.decision_note, o.created_at,
    (select count(*)::int from purchase_order_items i where i.po_id = o.po_id) as item_count
  from purchase_orders o
  join branches b on b.branch_id = o.branch_id
  left join users cu on cu.user_id = o.created_by
  left join users du on du.user_id = o.decided_by`

// ── Input ───────────────────────────────────────────────────────────────
const parseJsonField = (v: unknown) => {
  if (typeof v !== 'string') return v
  try { return JSON.parse(v) } catch { return undefined }
}

const ItemInput = z.object({
  itemName: z.string().trim().min(2, 'nama barang minimal 2 karakter').max(120),
  qty: z.coerce.number().positive('jumlah harus lebih dari 0').max(1_000_000),
  unit: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : 'pcs'), z.string().max(20)),
  note: optionalText,
})

const OrderInput = z.object({
  requesterName: z.string().trim().min(2, 'nama pemesan wajib diisi').max(80),
  requesterContact: optionalText,
  neededDate: optionalDate,
  notes: optionalText,
  items: z.preprocess(parseJsonField, z.array(ItemInput).min(1, 'isi minimal satu barang').max(50, 'maksimal 50 barang')),
})
type ParsedOrder = z.infer<typeof OrderInput>

/** Field `itemsJson` (dari form) dipetakan ke `items`. */
const withItems = (input: unknown) => {
  const o = (input ?? {}) as Record<string, unknown>
  return { ...o, items: o.items ?? o.itemsJson }
}

// ── Cabang ──────────────────────────────────────────────────────────────
export interface BranchDto {
  branchId: string
  branchName: string
  branchCode: string
  publicToken: string
  hasPin: boolean
  locked: boolean
  status: 'ACTIVE' | 'INACTIVE'
}
type BranchRow = {
  branch_id: string; branch_name: string; branch_code: string; public_token: string; pin_hash: string | null
  pin_failed_count: number; pin_locked_until: Date | null; status: 'ACTIVE' | 'INACTIVE'
}
const toBranch = (r: BranchRow): BranchDto => ({
  branchId: r.branch_id, branchName: r.branch_name, branchCode: r.branch_code, publicToken: r.public_token,
  hasPin: !!r.pin_hash, locked: !!r.pin_locked_until && r.pin_locked_until > new Date(), status: r.status,
})

/** Pilihan cabang aktif untuk form di aplikasi (semua user login). */
export async function listBranchOptions(_ctx: IdentityContext): Promise<{ branchId: string; branchName: string; branchCode: string }[]> {
  const rows = await db()<BranchRow[]>`select * from branches where status = 'ACTIVE' order by branch_name`
  return rows.map((r) => ({ branchId: r.branch_id, branchName: r.branch_name, branchCode: r.branch_code }))
}

export async function listBranches(ctx: IdentityContext): Promise<BranchDto[]> {
  await requireProcurement(ctx, 'BRANCHES_LISTED', 'BRANCH')
  const rows = await db()<BranchRow[]>`select * from branches order by branch_name`
  return rows.map(toBranch)
}

const BranchInput = z.object({
  branchName: z.string().trim().min(2, 'minimal 2 karakter').max(60),
  branchCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,6}$/, '2–6 huruf/angka, mis. BHY'),
})

const uniqueViolation = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505'

export async function createBranch(ctx: IdentityContext, input: unknown): Promise<BranchDto> {
  await requireProcurement(ctx, 'BRANCH_CREATED', 'BRANCH')
  const data = parseInput(BranchInput, input)
  try {
    return await db().begin(async (tx) => {
      const [r] = await tx<BranchRow[]>`insert into branches (branch_name, branch_code) values (${data.branchName}, ${data.branchCode}) returning *`
      await auditAs(ctx, { action: 'BRANCH_CREATED', resourceType: 'BRANCH', resourceId: r.branch_id, result: 'SUCCESS', metadata: { branchName: r.branch_name } }, tx)
      return toBranch(r)
    })
  } catch (e) {
    if (uniqueViolation(e)) throw new ServiceError('CONFLICT', 'Nama atau kode cabang sudah dipakai.')
    throw e
  }
}

const PinInput = z.object({ pin: z.string().trim().regex(/^[A-Za-z0-9]{4,12}$/, 'PIN 4–12 huruf/angka') })

export async function setBranchPin(ctx: IdentityContext, branchId: unknown, input: unknown): Promise<BranchDto> {
  await requireProcurement(ctx, 'BRANCH_PIN_SET', 'BRANCH', typeof branchId === 'string' ? branchId : null)
  const id = requireUuid(branchId, 'Cabang')
  const { pin } = parseInput(PinInput, input)
  const hash = await bcrypt.hash(pin, 10)
  const [r] = await db()<BranchRow[]>`
    update branches set pin_hash = ${hash}, pin_failed_count = 0, pin_locked_until = null, updated_at = now()
    where branch_id = ${id} returning *`
  if (!r) throw new ServiceError('NOT_FOUND', 'Cabang tidak ditemukan.')
  await auditAs(ctx, { action: 'BRANCH_PIN_SET', resourceType: 'BRANCH', resourceId: id, result: 'SUCCESS', metadata: { branchName: r.branch_name } })
  return toBranch(r)
}

export async function updateBranch(ctx: IdentityContext, branchId: unknown, input: unknown): Promise<BranchDto> {
  await requireProcurement(ctx, 'BRANCH_UPDATED', 'BRANCH', typeof branchId === 'string' ? branchId : null)
  const id = requireUuid(branchId, 'Cabang')
  const data = parseInput(z.object({ branchName: BranchInput.shape.branchName, status: z.enum(['ACTIVE', 'INACTIVE']) }), input)
  try {
    const [r] = await db()<BranchRow[]>`
      update branches set branch_name = ${data.branchName}, status = ${data.status}, updated_at = now()
      where branch_id = ${id} returning *`
    if (!r) throw new ServiceError('NOT_FOUND', 'Cabang tidak ditemukan.')
    await auditAs(ctx, { action: 'BRANCH_UPDATED', resourceType: 'BRANCH', resourceId: id, result: 'SUCCESS', metadata: { branchName: r.branch_name, status: r.status } })
    return toBranch(r)
  } catch (e) {
    if (uniqueViolation(e)) throw new ServiceError('CONFLICT', 'Nama cabang sudah dipakai.')
    throw e
  }
}

/** Mengganti link formulir publik (link lama langsung tidak berlaku), mis. bila link bocor. */
export async function regenerateBranchLink(ctx: IdentityContext, branchId: unknown): Promise<BranchDto> {
  await requireProcurement(ctx, 'BRANCH_LINK_REGENERATED', 'BRANCH', typeof branchId === 'string' ? branchId : null)
  const id = requireUuid(branchId, 'Cabang')
  const [r] = await db()<BranchRow[]>`
    update branches set public_token = replace(gen_random_uuid()::text, '-', ''), updated_at = now()
    where branch_id = ${id} returning *`
  if (!r) throw new ServiceError('NOT_FOUND', 'Cabang tidak ditemukan.')
  await auditAs(ctx, { action: 'BRANCH_LINK_REGENERATED', resourceType: 'BRANCH', resourceId: id, result: 'SUCCESS', metadata: { branchName: r.branch_name } })
  return toBranch(r)
}

// ── Akses publik: link + PIN cabang ─────────────────────────────────────
const MAX_PIN_FAILS = 5
const LOCK_MINUTES = 15

export async function getPublicBranch(token: string): Promise<{ branchName: string; branchCode: string; ready: boolean } | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null
  const [b] = await db()<BranchRow[]>`select * from branches where public_token = ${token} and status = 'ACTIVE'`
  return b ? { branchName: b.branch_name, branchCode: b.branch_code, ready: !!b.pin_hash } : null
}

/** Memeriksa link + PIN. PIN salah berulang mengunci cabang sementara (anti tebak-tebakan). */
async function authBranch(token: unknown, pin: unknown): Promise<BranchRow> {
  const invalid = new ServiceError('NOT_FOUND', 'Link formulir tidak valid atau cabang sudah tidak aktif.')
  if (typeof token !== 'string' || !/^[0-9a-f]{32}$/.test(token)) throw invalid
  const [b] = await db()<BranchRow[]>`select * from branches where public_token = ${token} and status = 'ACTIVE'`
  if (!b) throw invalid
  if (!b.pin_hash) throw new ServiceError('UNAVAILABLE', 'PIN cabang belum diatur. Hubungi PSCM.')
  if (b.pin_locked_until && b.pin_locked_until > new Date())
    throw new ServiceError('LOCKED', `Terlalu banyak PIN salah. Coba lagi dalam ${LOCK_MINUTES} menit atau hubungi PSCM.`)
  const ok = typeof pin === 'string' && pin !== '' && (await bcrypt.compare(pin.trim(), b.pin_hash))
  if (!ok) {
    await db()`
      update branches set
        pin_failed_count = case when pin_failed_count + 1 >= ${MAX_PIN_FAILS} then 0 else pin_failed_count + 1 end,
        pin_locked_until = case when pin_failed_count + 1 >= ${MAX_PIN_FAILS} then now() + ${LOCK_MINUTES} * interval '1 minute' else pin_locked_until end
      where branch_id = ${b.branch_id}`
    await recordAudit({ action: 'BRANCH_PIN_FAILED', resourceType: 'BRANCH', resourceId: b.branch_id, result: 'DENIED', metadata: { branchName: b.branch_name } })
    throw new ServiceError('INVALID_CREDENTIALS', 'PIN salah.')
  }
  if (b.pin_failed_count > 0 || b.pin_locked_until)
    await db()`update branches set pin_failed_count = 0, pin_locked_until = null where branch_id = ${b.branch_id}`
  return b
}

// ── Membuat pesanan ─────────────────────────────────────────────────────
async function insertOrder(
  tx: Tx,
  opts: { branchId: string; branchCode: string; source: OrderSource; createdBy: string | null; data: ParsedOrder },
): Promise<{ poId: string; poNumber: string }> {
  const year = Number(todayJakarta().slice(0, 4))
  const [c] = await tx<{ last_seq: number }[]>`
    insert into po_counters (branch_id, year, last_seq) values (${opts.branchId}, ${year}, 1)
    on conflict (branch_id, year) do update set last_seq = po_counters.last_seq + 1
    returning last_seq`
  const poNumber = `SP/${opts.branchCode}/${year}/${String(c.last_seq).padStart(4, '0')}`
  const d = opts.data
  const [o] = await tx<{ po_id: string }[]>`
    insert into purchase_orders (po_number, branch_id, requester_name, requester_contact, needed_date, notes, source, created_by)
    values (${poNumber}, ${opts.branchId}, ${d.requesterName}, ${d.requesterContact}, ${d.neededDate}, ${d.notes}, ${opts.source}, ${opts.createdBy})
    returning po_id`
  for (const [i, it] of d.items.entries()) {
    await tx`insert into purchase_order_items (po_id, line_no, item_name, qty, unit, note)
             values (${o.po_id}, ${i + 1}, ${it.itemName}, ${it.qty}, ${it.unit}, ${it.note})`
  }
  return { poId: o.po_id, poNumber }
}

/** Pesanan dari formulir publik (tanpa login): link rahasia cabang + PIN cabang. */
export async function submitPublicOrder(input: unknown): Promise<{ poNumber: string; branchName: string }> {
  const raw = (input ?? {}) as Record<string, unknown>
  const branch = await authBranch(raw.token, raw.pin)
  const data = parseInput(OrderInput, withItems(raw))
  const created = await db().begin(async (tx) => {
    const r = await insertOrder(tx, { branchId: branch.branch_id, branchCode: branch.branch_code, source: 'FORM_PUBLIK', createdBy: null, data })
    await recordAudit({
      action: 'PO_CREATED', resourceType: 'PURCHASE_ORDER', resourceId: r.poId, result: 'SUCCESS',
      metadata: { poNumber: r.poNumber, branch: branch.branch_name, via: 'FORM_PUBLIK', requesterName: data.requesterName, items: data.items.length },
    }, tx)
    return r
  })
  return { poNumber: created.poNumber, branchName: branch.branch_name }
}

/** Pesanan dari dalam aplikasi (login). */
export async function createOrder(ctx: IdentityContext, input: unknown): Promise<OrderDto> {
  const raw = (input ?? {}) as Record<string, unknown>
  const branchId = requireUuid(raw.branchId, 'Cabang')
  const [branch] = await db()<BranchRow[]>`select * from branches where branch_id = ${branchId} and status = 'ACTIVE'`
  if (!branch) throw new ServiceError('VALIDATION', 'branchId: cabang tidak ditemukan atau tidak aktif')
  const data = parseInput(OrderInput, withItems({ ...raw, requesterName: raw.requesterName || ctx.name }))
  const created = await db().begin(async (tx) => {
    const r = await insertOrder(tx, { branchId, branchCode: branch.branch_code, source: 'APLIKASI', createdBy: ctx.userId, data })
    await auditAs(ctx, {
      action: 'PO_CREATED', resourceType: 'PURCHASE_ORDER', resourceId: r.poId, result: 'SUCCESS',
      metadata: { poNumber: r.poNumber, branch: branch.branch_name, via: 'APLIKASI', items: data.items.length },
    }, tx)
    return r
  })
  return loadOrder(created.poId)
}

// ── Baca ────────────────────────────────────────────────────────────────
async function loadOrder(poId: string, withDetail = false): Promise<OrderDto> {
  const [row] = await db()<OrderRow[]>`${orderSelect(db())} where o.po_id = ${poId}`
  if (!row) throw new ServiceError('NOT_FOUND', 'Pesanan tidak ditemukan.')
  const dto = toOrder(row)
  if (withDetail) {
    dto.items = await loadItems(db(), poId)
    dto.movements = await loadMovements(db(), poId)
  }
  return dto
}

type ItemRow = { item_id: string; line_no: number; item_name: string; qty: string; unit: string; note: string | null; received: string; sent: string }
async function loadItems(q: Sql | Tx, poId: string): Promise<OrderItemDto[]> {
  const rows = await q<ItemRow[]>`
    select i.item_id, i.line_no, i.item_name, i.qty, i.unit, i.note,
      coalesce((select sum(m.qty) from goods_movements m where m.item_id = i.item_id and m.direction = 'MASUK'), 0) as received,
      coalesce((select sum(m.qty) from goods_movements m where m.item_id = i.item_id and m.direction = 'KELUAR'), 0) as sent
    from purchase_order_items i where i.po_id = ${poId} order by i.line_no`
  return rows.map((r) => ({ itemId: r.item_id, lineNo: r.line_no, itemName: r.item_name, qty: Number(r.qty), unit: r.unit, note: r.note, received: Number(r.received), sent: Number(r.sent) }))
}

type MoveRow = { movement_id: string; item_name: string; unit: string; direction: Direction; qty: string; moved_on: string; recorded_by_name: string; source: OrderSource; note: string | null; created_at: Date }
async function loadMovements(q: Sql | Tx, poId: string): Promise<MovementDto[]> {
  const rows = await q<MoveRow[]>`
    select m.movement_id, i.item_name, i.unit, m.direction, m.qty, m.moved_on, m.recorded_by_name, m.source, m.note, m.created_at
    from goods_movements m join purchase_order_items i on i.item_id = m.item_id
    where m.po_id = ${poId} order by m.created_at desc, m.movement_id`
  return rows.map((r) => ({ movementId: r.movement_id, itemName: r.item_name, unit: r.unit, direction: r.direction, qty: Number(r.qty), movedOn: r.moved_on, recordedByName: r.recorded_by_name, source: r.source, note: r.note, createdAt: r.created_at }))
}

export interface OrderFilter { status?: string; branchId?: string; limit?: number }

/** PSCM melihat semua pesanan; user lain hanya pesanan yang ia buat sendiri lewat aplikasi. */
export async function listOrders(ctx: IdentityContext, f: OrderFilter = {}): Promise<OrderDto[]> {
  const all = await isProcurement(ctx)
  const q = db()
  const statuses = f.status === 'OPEN' ? ['MENUNGGU', 'DISETUJUI', 'SEBAGIAN_DITERIMA'] : f.status && f.status !== 'ALL' ? [f.status] : null
  const rows = await q<OrderRow[]>`
    ${orderSelect(q)}
    where ${all ? q`true` : q`o.created_by = ${ctx.userId}`}
      and ${statuses ? q`o.status in ${q(statuses)}` : q`true`}
      and ${f.branchId ? q`o.branch_id = ${requireUuid(f.branchId, 'Cabang')}` : q`true`}
    order by o.created_at desc limit ${Math.min(f.limit ?? 100, 200)}`
  return rows.map(toOrder)
}

export async function getOrder(ctx: IdentityContext, poId: unknown): Promise<OrderDto> {
  const id = requireUuid(poId, 'Pesanan')
  const dto = await loadOrder(id, true)
  if (!(await canAccess(ctx, id))) {
    await auditAs(ctx, { action: 'PO_VIEWED', resourceType: 'PURCHASE_ORDER', resourceId: id, result: 'DENIED' })
    throw new ServiceError('ACCESS_DENIED', 'Akses ditolak. Anda tidak memiliki izin untuk pesanan ini.')
  }
  return dto
}

async function canAccess(ctx: IdentityContext, poId: string) {
  if (await isProcurement(ctx)) return true
  const [r] = await db()`select 1 from purchase_orders where po_id = ${poId} and created_by = ${ctx.userId}`
  return !!r
}

export async function pendingOrderCount(ctx: IdentityContext): Promise<number> {
  if (!(await isProcurement(ctx))) return 0
  const [r] = await db()<{ n: number }[]>`select count(*)::int as n from purchase_orders where status = 'MENUNGGU'`
  return r.n
}

// ── Keputusan PSCM ──────────────────────────────────────────────────────
const DecisionInput = z.object({
  decision: z.enum(['SETUJUI', 'TOLAK']),
  note: optionalText,
  supplierName: optionalText,
})

export async function decideOrder(ctx: IdentityContext, poId: unknown, input: unknown): Promise<OrderDto> {
  await requireProcurement(ctx, 'PO_DECIDED', 'PURCHASE_ORDER', typeof poId === 'string' ? poId : null)
  const id = requireUuid(poId, 'Pesanan')
  const data = parseInput(DecisionInput, input)
  if (data.decision === 'TOLAK' && !data.note) throw new ServiceError('VALIDATION', 'note: alasan penolakan wajib diisi')
  const status: OrderStatus = data.decision === 'SETUJUI' ? 'DISETUJUI' : 'DITOLAK'
  await db().begin(async (tx) => {
    const [cur] = await tx<{ status: OrderStatus; po_number: string }[]>`select status, po_number from purchase_orders where po_id = ${id} for update`
    if (!cur) throw new ServiceError('NOT_FOUND', 'Pesanan tidak ditemukan.')
    if (cur.status !== 'MENUNGGU') throw new ServiceError('CONFLICT', 'Pesanan ini sudah diproses sebelumnya.')
    await tx`
      update purchase_orders set status = ${status}, decided_by = ${ctx.userId}, decided_at = now(), decision_note = ${data.note},
        supplier_name = ${data.supplierName}, updated_at = now()
      where po_id = ${id}`
    await auditAs(ctx, {
      action: data.decision === 'SETUJUI' ? 'PO_APPROVED' : 'PO_REJECTED', resourceType: 'PURCHASE_ORDER', resourceId: id, result: 'SUCCESS',
      metadata: { poNumber: cur.po_number, note: data.note, supplierName: data.supplierName },
    }, tx)
  })
  return loadOrder(id, true)
}

export async function cancelOrder(ctx: IdentityContext, poId: unknown): Promise<OrderDto> {
  const id = requireUuid(poId, 'Pesanan')
  if (!(await canAccess(ctx, id))) {
    await auditAs(ctx, { action: 'PO_CANCELLED', resourceType: 'PURCHASE_ORDER', resourceId: id, result: 'DENIED' })
    throw new ServiceError('ACCESS_DENIED', 'Akses ditolak. Anda tidak memiliki izin untuk pesanan ini.')
  }
  await db().begin(async (tx) => {
    const [cur] = await tx<{ status: OrderStatus; po_number: string }[]>`select status, po_number from purchase_orders where po_id = ${id} for update`
    if (!cur) throw new ServiceError('NOT_FOUND', 'Pesanan tidak ditemukan.')
    if (cur.status !== 'MENUNGGU') throw new ServiceError('CONFLICT', 'Hanya pesanan yang masih menunggu yang dapat dibatalkan.')
    await tx`update purchase_orders set status = 'DIBATALKAN', updated_at = now() where po_id = ${id}`
    await auditAs(ctx, { action: 'PO_CANCELLED', resourceType: 'PURCHASE_ORDER', resourceId: id, result: 'SUCCESS', metadata: { poNumber: cur.po_number } }, tx)
  })
  return loadOrder(id, true)
}

// ── Barang masuk / keluar ───────────────────────────────────────────────
const MovementInput = z.object({
  direction: z.enum(['MASUK', 'KELUAR']),
  movedOn: optionalDate,
  recordedByName: z.string().trim().min(2, 'nama pencatat wajib diisi').max(80),
  note: optionalText,
  lines: z.preprocess(parseJsonField, z.array(z.object({
    itemId: z.string().uuid('barang tidak valid'),
    qty: z.coerce.number().min(0).max(1_000_000),
  })).max(50)),
})

/** Mencatat gerakan barang & menghitung ulang status pesanan. Pesanan dikunci agar jumlah tidak balapan. */
async function recordMovementCore(
  tx: Tx,
  poId: string,
  src: { source: OrderSource; userId: string | null; name: string },
  raw: Record<string, unknown>,
): Promise<{ poNumber: string; direction: Direction; lines: number }> {
  const data = parseInput(MovementInput, { ...raw, recordedByName: raw.recordedByName || src.name, lines: raw.lines ?? raw.linesJson })
  const lines = data.lines.filter((l) => l.qty > 0)
  if (!lines.length) throw new ServiceError('VALIDATION', 'lines: isi jumlah untuk minimal satu barang')
  const [po] = await tx<{ status: OrderStatus; po_number: string }[]>`select status, po_number from purchase_orders where po_id = ${poId} for update`
  if (!po) throw new ServiceError('NOT_FOUND', 'Pesanan tidak ditemukan.')
  if (po.status === 'DITERIMA') throw new ServiceError('CONFLICT', 'Pesanan ini sudah diterima lengkap.')
  if (po.status !== 'DISETUJUI' && po.status !== 'SEBAGIAN_DITERIMA')
    throw new ServiceError('CONFLICT', 'Barang hanya dapat dicatat untuk pesanan yang sudah disetujui PSCM.')
  const items = await loadItems(tx, poId)
  const byId = new Map(items.map((i) => [i.itemId, i]))
  const seen = new Set<string>()
  for (const l of lines) {
    const it = byId.get(l.itemId)
    if (!it) throw new ServiceError('VALIDATION', 'lines: barang tidak termasuk pesanan ini')
    if (seen.has(l.itemId)) throw new ServiceError('VALIDATION', `lines: "${it.itemName}" terisi dua kali`)
    seen.add(l.itemId)
    if (data.direction === 'MASUK' && it.received + l.qty > it.qty + 1e-9)
      throw new ServiceError('VALIDATION', `Jumlah diterima untuk "${it.itemName}" melebihi pesanan (sisa ${+(it.qty - it.received).toFixed(2)} ${it.unit}).`)
  }
  const day = data.movedOn ?? todayJakarta()
  for (const l of lines) {
    await tx`
      insert into goods_movements (po_id, item_id, direction, qty, moved_on, recorded_by_name, recorded_by_user, source, note)
      values (${poId}, ${l.itemId}, ${data.direction}, ${l.qty}, ${day}, ${data.recordedByName}, ${src.userId}, ${src.source}, ${data.note})`
  }
  if (data.direction === 'MASUK') {
    const after = await loadItems(tx, poId)
    const complete = after.every((i) => i.received + 1e-9 >= i.qty)
    const any = after.some((i) => i.received > 0)
    await tx`update purchase_orders set status = ${complete ? 'DITERIMA' : any ? 'SEBAGIAN_DITERIMA' : po.status}, updated_at = now() where po_id = ${poId}`
  }
  return { poNumber: po.po_number, direction: data.direction, lines: lines.length }
}

export async function recordMovement(ctx: IdentityContext, poId: unknown, input: unknown): Promise<OrderDto> {
  const id = requireUuid(poId, 'Pesanan')
  if (!(await canAccess(ctx, id))) {
    await auditAs(ctx, { action: 'GOODS_RECORDED', resourceType: 'PURCHASE_ORDER', resourceId: id, result: 'DENIED' })
    throw new ServiceError('ACCESS_DENIED', 'Akses ditolak. Anda tidak memiliki izin untuk pesanan ini.')
  }
  await db().begin(async (tx) => {
    const r = await recordMovementCore(tx, id, { source: 'APLIKASI', userId: ctx.userId, name: ctx.name }, (input ?? {}) as Record<string, unknown>)
    await auditAs(ctx, {
      action: r.direction === 'MASUK' ? 'GOODS_RECEIVED' : 'GOODS_SENT', resourceType: 'PURCHASE_ORDER', resourceId: id, result: 'SUCCESS',
      metadata: { poNumber: r.poNumber, lines: r.lines, via: 'APLIKASI' },
    }, tx)
  })
  return loadOrder(id, true)
}

/** Cabang mencari pesanannya (nomor SP + PIN) sebelum mencatat barang masuk/keluar. */
export async function lookupPublicOrder(input: unknown): Promise<OrderDto> {
  const raw = (input ?? {}) as Record<string, unknown>
  const branch = await authBranch(raw.token, raw.pin)
  const poNumber = typeof raw.poNumber === 'string' ? raw.poNumber.trim().toUpperCase() : ''
  const [o] = await db()<{ po_id: string; status: OrderStatus }[]>`
    select po_id, status from purchase_orders where po_number = ${poNumber} and branch_id = ${branch.branch_id}`
  if (!o) throw new ServiceError('NOT_FOUND', 'Nomor pesanan tidak ditemukan untuk cabang ini.')
  if (o.status !== 'DISETUJUI' && o.status !== 'SEBAGIAN_DITERIMA') {
    const msg: Partial<Record<OrderStatus, string>> = {
      MENUNGGU: 'Pesanan ini belum disetujui PSCM.', DITOLAK: 'Pesanan ini ditolak PSCM.',
      DITERIMA: 'Pesanan ini sudah diterima lengkap.', DIBATALKAN: 'Pesanan ini sudah dibatalkan.',
    }
    throw new ServiceError('CONFLICT', msg[o.status] ?? 'Pesanan ini tidak dapat dicatat barangnya.')
  }
  const dto = await loadOrder(o.po_id)
  dto.items = await loadItems(db(), o.po_id)
  return dto
}

export async function recordPublicMovement(input: unknown): Promise<{ poNumber: string; direction: Direction }> {
  const raw = (input ?? {}) as Record<string, unknown>
  const branch = await authBranch(raw.token, raw.pin)
  const poNumber = typeof raw.poNumber === 'string' ? raw.poNumber.trim().toUpperCase() : ''
  const [o] = await db()<{ po_id: string }[]>`select po_id from purchase_orders where po_number = ${poNumber} and branch_id = ${branch.branch_id}`
  if (!o) throw new ServiceError('NOT_FOUND', 'Nomor pesanan tidak ditemukan untuk cabang ini.')
  return db().begin(async (tx) => {
    const r = await recordMovementCore(tx, o.po_id, { source: 'FORM_PUBLIK', userId: null, name: '' }, raw)
    await recordAudit({
      action: r.direction === 'MASUK' ? 'GOODS_RECEIVED' : 'GOODS_SENT', resourceType: 'PURCHASE_ORDER', resourceId: o.po_id, result: 'SUCCESS',
      metadata: { poNumber: r.poNumber, lines: r.lines, via: 'FORM_PUBLIK', branch: branch.branch_name, recordedBy: raw.recordedByName },
    }, tx)
    return { poNumber: r.poNumber, direction: r.direction }
  })
}
