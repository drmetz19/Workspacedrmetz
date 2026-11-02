import type { IdentityContext } from '../context'
import { searchDocuments } from '../services/search'
import { getDocumentHistory, getDocumentMetadata } from '../services/documents'
import { listCategories, listDivisions } from '../services/org'
import { getCommandCenter } from '../services/dashboard'
import { getOrder, listBranchOptions, listOrders } from '../services/orders'
import { listActionItems, listMeetings } from '../services/meetings'

/**
 * Tool MCP tahap 1 — SEMUA BACA SAJA. Tiap tool membungkus fungsi service yang sama dengan aplikasi,
 * sehingga permission engine (level L1–5, divisi, PIC, grant) berlaku persis seperti untuk user pemilik token.
 * Tidak ada tool tulis/hapus/setuju di sini; menambahkannya butuh keputusan terpisah.
 */
export interface McpTool {
  name: string
  title: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties: false }
  run: (ctx: IdentityContext, args: Record<string, unknown>) => Promise<unknown>
}

const str = (description: string) => ({ type: 'string', description })
const num = (description: string) => ({ type: 'number', description })
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object' as const, properties, required, additionalProperties: false as const })
const cap = (n: unknown, max: number, dflt: number) => Math.min(Math.max(Number(n) || dflt, 1), max)

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'search_documents',
    title: 'Cari dokumen',
    description: 'Mencari dokumen di direktori CSSE (nama, nomor, ringkasan, PIC). Hasil sudah difilter sesuai hak akses user pemilik token. Mengembalikan metadata, bukan isi berkas.',
    inputSchema: obj({
      q: str('Kata kunci, mis. "SIP dr. Elsa" atau "izin klinik"'),
      categoryId: str('ID kategori (lihat list_categories)'),
      divisionId: str('ID divisi (lihat list_divisions)'),
      status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'ALL'], description: 'Default ACTIVE' },
      expiry: { type: 'string', enum: ['expired', 'within30', 'within90', 'none'], description: 'Filter masa berlaku' },
      year: num('Tahun berlaku/berakhir, mis. 2026'),
      limit: num('Maksimal hasil (1–50, default 20)'),
    }),
    run: (ctx, a) => searchDocuments(ctx, { ...a, limit: cap(a.limit, 50, 20) }),
  },
  {
    name: 'get_document_metadata',
    title: 'Detail dokumen',
    description: 'Detail metadata satu dokumen (kategori, divisi, PIC, level, masa berlaku, status akses). Ditolak bila user pemilik token tidak berhak.',
    inputSchema: obj({ documentId: str('ID dokumen') }, ['documentId']),
    run: (ctx, a) => getDocumentMetadata(ctx, a.documentId),
  },
  {
    name: 'get_document_history',
    title: 'Riwayat dokumen',
    description: 'Riwayat perubahan satu dokumen (siapa mengubah apa dan kapan).',
    inputSchema: obj({ documentId: str('ID dokumen') }, ['documentId']),
    run: (ctx, a) => getDocumentHistory(ctx, a.documentId, 50),
  },
  {
    name: 'list_divisions',
    title: 'Daftar divisi',
    description: 'Daftar divisi aktif beserta jumlah user.',
    inputSchema: obj({}),
    run: (ctx) => listDivisions(ctx),
  },
  {
    name: 'list_categories',
    title: 'Daftar kategori dokumen',
    description: 'Daftar kategori dokumen yang aktif.',
    inputSchema: obj({}),
    run: (ctx) => listCategories(ctx),
  },
  {
    name: 'get_overview',
    title: 'Ringkasan Command Center',
    description: 'Ringkasan: jumlah dokumen per status/level, dokumen akan kedaluwarsa, draft menunggu review, ringkasan per divisi, aktivitas terbaru. Sesuai hak akses user.',
    inputSchema: obj({}),
    run: (ctx) => getCommandCenter(ctx),
  },
  {
    name: 'list_branches',
    title: 'Daftar cabang',
    description: 'Daftar cabang aktif (nama dan kode). Tidak menampilkan link atau PIN formulir.',
    inputSchema: obj({}),
    run: (ctx) => listBranchOptions(ctx),
  },
  {
    name: 'list_orders',
    title: 'Daftar Surat Pesanan',
    description: 'Surat Pesanan barang. User PSCM/GM/Owner melihat semua cabang; user lain hanya pesanan yang ia buat. Status: MENUNGGU, DISETUJUI, DITOLAK, SEBAGIAN_DITERIMA, DITERIMA, DIBATALKAN, atau OPEN (berjalan).',
    inputSchema: obj({
      status: str('Salah satu status di atas, OPEN, atau ALL'),
      branchId: str('ID cabang (lihat list_branches)'),
      limit: num('Maksimal hasil (1–50, default 20)'),
    }),
    run: async (ctx, a) => (await listOrders(ctx, { status: a.status as string | undefined, branchId: a.branchId as string | undefined, limit: cap(a.limit, 50, 20) })),
  },
  {
    name: 'get_order',
    title: 'Detail Surat Pesanan',
    description: 'Detail satu Surat Pesanan: barang, jumlah, yang sudah diterima/dikirim, riwayat barang masuk/keluar.',
    inputSchema: obj({ orderId: str('ID pesanan (poId) dari list_orders') }, ['orderId']),
    run: (ctx, a) => getOrder(ctx, a.orderId),
  },
  {
    name: 'list_meetings',
    title: 'Daftar notulensi rapat',
    description: 'Notulensi rapat terbaru. User divisi hanya melihat divisinya sendiri.',
    inputSchema: obj({ divisionId: str('ID divisi'), limit: num('Maksimal hasil (1–50, default 20)') }),
    run: (ctx, a) => listMeetings(ctx, { divisionId: a.divisionId as string | undefined, limit: cap(a.limit, 50, 20) }),
  },
  {
    name: 'list_action_items',
    title: 'Daftar tindak lanjut rapat',
    description: 'To-do hasil rapat dengan status, PIC, dan tenggat.',
    inputSchema: obj({
      divisionId: str('ID divisi'),
      status: { type: 'string', enum: ['OPEN', 'BELUM_MULAI', 'BERJALAN', 'SELESAI'], description: 'OPEN = belum selesai' },
      scope: { type: 'string', enum: ['all', 'mine'], description: 'mine = milik user pemilik token' },
      limit: num('Maksimal hasil (1–50, default 20)'),
    }),
    run: (ctx, a) => listActionItems(ctx, {
      divisionId: a.divisionId as string | undefined,
      status: a.status as 'OPEN' | 'BELUM_MULAI' | 'BERJALAN' | 'SELESAI' | undefined,
      scope: a.scope as 'all' | 'mine' | undefined,
      limit: cap(a.limit, 50, 20),
    }),
  },
]
