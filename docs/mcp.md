# Server MCP CSSE (tahap 1: baca saja)

AI agent (Claude Code, Claude Desktop, atau klien MCP lain) dapat membaca data CSSE lewat endpoint:

```
POST https://<alamat-aplikasi>/api/mcp        Authorization: Bearer csse_agent_…
```

Transport: Streamable HTTP tanpa sesi dan tanpa SSE (hanya `POST`, JSON). Protokol yang didukung: `2025-06-18`, `2025-03-26`, `2024-11-05`.

## Keamanan
- **Token** dibuat Owner di **Admin → Token AI Agent**. Token terikat ke satu user; agent hanya melihat yang boleh dilihat user itu (level L1–5, divisi, PIC, grant) karena memakai fungsi service dan permission engine yang sama dengan aplikasi.
- Yang tersimpan di database hanya **hash SHA-256**. Token polos tampil **sekali** saat dibuat.
- Token punya masa berlaku (default 30 hari, maks 365) dan bisa **dicabut** kapan saja. User nonaktif otomatis menutup tokennya.
- **Semua tool baca saja.** Tidak ada tool untuk membuat, mengubah, menyetujui, atau menghapus. Menambahkannya adalah keputusan terpisah.
- Setiap panggilan tool dicatat di audit (`MCP_TOOL_CALLED`, source `AI`, nama agent, nama tool, argumen).
- Link dan PIN formulir cabang **tidak** bisa dibaca lewat MCP.
- Permintaan dengan header `Origin` dari situs lain ditolak (anti DNS-rebinding). Isi hasil dibatasi 100 KB.

## Menyambungkan
Claude Code:
```bash
claude mcp add --transport http csse https://<alamat-aplikasi>/api/mcp --header "Authorization: Bearer <token>"
```
Atau `.mcp.json`:
```json
{ "mcpServers": { "csse": { "type": "http", "url": "https://<alamat-aplikasi>/api/mcp", "headers": { "Authorization": "Bearer <token>" } } } }
```
Uji cepat:
```bash
curl -s -X POST https://<alamat-aplikasi>/api/mcp -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Tool (11)
| Tool | Fungsi |
|---|---|
| `search_documents` | Cari dokumen (kata kunci, kategori, divisi, status, masa berlaku, tahun) |
| `get_document_metadata` | Detail satu dokumen |
| `get_document_history` | Riwayat perubahan dokumen |
| `list_divisions`, `list_categories` | Master data |
| `get_overview` | Ringkasan Command Center |
| `list_branches` | Cabang aktif (tanpa link/PIN) |
| `list_orders`, `get_order` | Surat Pesanan, barang, penerimaan/pengiriman |
| `list_meetings`, `list_action_items` | Notulensi dan tindak lanjut |

Kode: `src/server/mcp/tools.ts` (daftar tool), `src/server/mcp/handler.ts` (protokol), `src/server/services/agents.ts` (token), `src/app/api/mcp/route.ts` (endpoint).

## Batasan saat ini
- `search_documents` mengembalikan **metadata**, bukan isi berkas. Laporan PDF yang sudah diunggah dapat ditemukan, tetapi belum dibaca isinya. Lihat `plans/api-mcp-per-divisi.md`.
- Belum ada pembatasan laju (rate limit) per token.
