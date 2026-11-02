# Analisis: API & MCP per divisi

Status: tahap 1 selesai (token agent + server MCP baca saja untuk modul yang sudah ada). Dokumen ini memetakan yang berikutnya.

## Yang sudah dibangun (tahap 1)
Server MCP `/api/mcp` membungkus fungsi service yang sudah ada, jadi **hak akses otomatis sama dengan aplikasi** (lihat `docs/mcp.md`). Cakupan data: dokumen & perizinan (Legal), Surat Pesanan & barang masuk/keluar (Supply Chain), notulensi & tindak lanjut (semua divisi), ringkasan Command Center.

## Peta per divisi
| Divisi | Yang sudah ada di CSSE | Sumber data yang diinginkan | Usulan tool MCP | Status |
|---|---|---|---|---|
| Legal/Perizinan | Registry dokumen L1–5, kedaluwarsa | — | `search_documents`, `get_document_metadata`, `get_overview` | **Ada** |
| Supply Chain | Surat Pesanan, barang masuk/keluar per cabang | **Inventaris/stok** (sistem Anda) | `list_orders`, `get_order` sudah ada; baru: `get_stock_report`, `list_low_stock` | Pesanan **ada**; stok menunggu sumber |
| Sales | Laporan Oktober tersimpan sebagai dokumen | Laporan penjualan (mis. Scalev) | baru: `get_sales_report(period)`, `list_orders_sales` | Menunggu sumber |
| Marketing | Laporan bulanan tersimpan sebagai dokumen | Laporan iklan (Meta Ads) dan **insight social media** (akan ada laporan khusus) | baru: `get_ads_report(period)`, `get_social_insight_report(period)` | Menunggu sumber |
| Finance | Laporan Oktober Finance & PSCM sebagai dokumen | Laporan keuangan | baru: `get_finance_report(period)` | Menunggu sumber |
| HRD | Laporan Oktober HR sebagai dokumen | Data kepegawaian | baru: `get_hr_report(period)` (data pribadi: wajib L4+) | Menunggu sumber |
| Operasional | Laporan per klinik (Bhayangkara, Cibadak) sebagai dokumen | Laporan klinik | baru: `get_operations_report(branch, period)` | Menunggu sumber |

## Rancangan modul per divisi (usulan)
Satu pola yang sama untuk semua divisi, supaya menambah divisi tidak perlu bangun dari nol:

1. **Penampung laporan generik** `division_reports`: divisi, jenis (`STOK`, `SALES`, `ADS`, `SOCIAL`, `KEUANGAN`, `HR`, `OPERASIONAL`), periode, cabang (opsional), data terstruktur (JSON), sumber, level keamanan, waktu masuk.
2. **Pintu masuk data** (pilih per sumber): (a) *push* — sistem sumber atau automasi mengirim ke `POST /api/ingest/{jenis}` dengan kunci per sumber; (b) *pull* — konektor terjadwal (cron Vercel) menarik dari API sumber; (c) unggah manual CSV/PDF oleh PIC divisi.
3. **Izin sama dengan dokumen**: setiap laporan punya divisi dan level; yang boleh melihat ditentukan permission engine yang sudah ada.
4. **Tool MCP per jenis** (`get_*_report`, `list_*`) yang membungkus service, tetap baca saja.
5. **Audit** untuk setiap masuk data dan setiap pembacaan agent.

## Keputusan yang masih terbuka
1. **Stok:** inventaris Anda ada di mana (aplikasi apa, punya API/ekspor)? Apakah stok per cabang, per gudang?
2. **Sales:** apakah sumbernya Scalev? Laporan yang dibutuhkan (omzet harian, per produk, per sumber iklan)?
3. **Marketing:** laporan insight social media akan berbentuk apa (PDF, spreadsheet, API)? Siapa yang mengirim dan seberapa sering?
4. **Finance/HRD:** data apa yang boleh dilihat agent, dan di level keamanan berapa?
5. **Isi PDF:** apakah agent perlu membaca **isi** laporan PDF yang sudah diunggah (butuh ekstraksi teks), atau cukup angka terstruktur?
6. **Hak tulis:** kapan agent boleh mengajukan (bukan menyetujui) Surat Pesanan?

## Urutan usulan
1. Penampung `division_reports` + satu jenis pertama yang sumbernya paling jelas (sebaiknya **Stok**, karena langsung melengkapi Surat Pesanan).
2. Laporan Sales dan Marketing/Ads.
3. Ekstraksi teks PDF agar agent bisa membaca laporan yang sudah diunggah.
4. Finance, HRD, Operasional (dengan level keamanan lebih ketat).
5. Rate limit per token dan peringatan token mendekati kedaluwarsa.
