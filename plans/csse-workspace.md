# Plan: Dr. Metz Workspace — CSSE (MVP Pilot)

> Source PRD: plans/prd-csse-workspace.md

## Architectural decisions

- **Stack**: Next.js (App Router) + TypeScript, Supabase (Postgres + Auth + Row Level Security), hosting Vercel. Modular monolith. Tooling: pnpm, `tsc --noEmit`, vitest.
- **Layering**: UI → Service layer (business logic, permission check, audit) → Integration layer (Drive adapter, AI adapter). UI dan AI tidak pernah memanggil Drive atau provider AI langsung.
- **Service contracts** (nama stabil, siap dibungkus MCP fase 2): `search_documents`, `get_document_metadata`, `get_authorized_document`, `create_document_record`, `update_document_metadata`, `request_document_access`, `approve_access_request`, `reject_access_request`, `list_pending_approvals`, `get_audit_history`. Setiap fungsi: identity context → authorization → action → structured response → audit event.
- **Routes**:
  - `/login`, `/invite/accept`
  - `/` (Command Center)
  - `/documents`, `/documents/[id]`, `/documents/new`, `/documents/review`
  - `/search`, `/search/ask`
  - `/access/mine`, `/access/pending`
  - `/audit`
  - `/admin/users`, `/admin/divisions`, `/admin/categories`, `/admin/sources`
  - API: `/api/documents/*`, `/api/access-requests/*`, `/api/search`, `/api/ask`, `/api/sources/*`, `/api/files/[documentId]` (proxy L3–5), `/api/cron/scan`, `/api/cron/expire-access`
- **Schema (tabel inti)**: `users` (user_id, drmetz_identity_id nullable, email, name, role_id, division_id, status INVITED/ACTIVE/DEACTIVATED — undangan = baris user INVITED), `sessions`, `auth_tokens` (undangan & reset), `email_outbox`, `roles`, `divisions`, `categories`, `documents` (document_id, external_provider, external_resource_id unik, external_url, name, category_id, division_id, security_level 1–5, owner_user_id, pic_user_id, status, version, supersedes_document_id, effective_date, expiry_date, document_number, confirmed_summary, owner_approval_required, source_id, flags), `document_suggestions` (saran AI terpisah dari field final), `permissions` (resource, principal_type USER/ROLE/DIVISION, principal_id, permission_type, granted_by, expires_at), `access_requests` (requester, document, reason, approver_rule, status, duration, decided_by, reject_reason, expires_at), `drive_sources` (drive id/folder id, type STANDARD/RESTRICTED, last_scan_at, status), `audit_events` (append-only).
- **Status dokumen**: DRAFT → ACTIVE → SUPERSEDED / ARCHIVED; flag SOURCE_MISSING, CONTENT_UNREADABLE.
- **Kebijakan level**: tabel di PRD (Implementation Decisions → Kebijakan level keamanan) adalah satu-satunya sumber aturan; diimplementasikan deterministik di permission engine, dicerminkan RLS.
- **Third-party boundaries**: Google Drive via akun service / domain-wide delegation (butuh D2); AI via satu adapter, satu provider (butuh D1).

---

## Phase 1: Login undangan
**User stories**: 1–8

### What to build
Owner pertama di-bootstrap. Owner mengundang user (email, role, divisi). User yang diundang login lewat Google (Workspace/Gmail) atau email + password. Email yang tidak diundang ditolak. Owner & GM hanya boleh login Google. Lockout setelah gagal password berulang, reset password via email. Owner bisa menonaktifkan user. Semua kejadian login tercatat di audit (tabel audit_events dibuat di fase ini).

### Acceptance criteria
- [x] Owner dapat membuat undangan; user diundang berhasil login via Google dan via email + password
- [x] Login dengan email yang tidak diundang ditolak dan menghasilkan audit event `LOGIN_REJECTED`
- [x] Akun GM/Owner yang mencoba login dengan password ditolak
- [x] Setelah N kali password salah, akun terkunci sementara; reset password via email berfungsi
- [x] User yang dinonaktifkan tidak bisa login dan melihat pesan "akun dinonaktifkan"
- [x] Setiap user punya `user_id` internal; `drmetz_identity_id` ada dan nullable
- [x] Audit event login berhasil/gagal/ditolak tercatat dengan actor, email, waktu, hasil

---

## Phase 2: Admin organisasi
**User stories**: 9–11

### What to build
Halaman admin untuk Owner: CRUD divisi, CRUD kategori (seed: Izin Operasional, SIP, STR, Kontrak, MoU, Sewa, Sertifikat, Lainnya), ubah role/divisi user, aktif/nonaktifkan user. Semua perubahan diaudit. Non-Owner tidak bisa mengakses halaman admin.

### Acceptance criteria
- [x] Owner dapat membuat/mengubah divisi dan kategori; kategori seed tersedia
- [x] Owner dapat mengubah role & divisi user; perubahan langsung berlaku pada sesi berikutnya
- [x] Division User/GM yang membuka `/admin/*` mendapat akses ditolak (dan diaudit)
- [x] Setiap perubahan admin menghasilkan audit event

---

## Phase 3: Registry manual + versi
**User stories**: 22, 23, 24, 26

### What to build
User berwenang membuat record dokumen secara manual (metadata + link/ID Drive), melihat daftar dan halaman detail (metadata, PIC, level, status, versi, tanggal, riwayat), mengedit metadata, mengarsipkan, dan menandai dokumen baru menggantikan dokumen lama (lama → SUPERSEDED, terhubung ke versi baru). Lewat service layer dengan audit. Permission di fase ini masih sederhana (Owner/GM penuh, Division User divisinya sendiri) — engine penuh di Phase 4.

### Acceptance criteria
- [ ] Record dokumen dapat dibuat dengan `document_id` internal; `external_resource_id` unik (duplikat ditolak)
- [ ] Halaman detail menampilkan seluruh metadata dan riwayat perubahan
- [ ] Edit metadata dan arsip tercatat di audit (`DOCUMENT_CREATED`, `DOCUMENT_UPDATED`, `DOCUMENT_ARCHIVED`)
- [ ] Menandai "menggantikan" mengubah dokumen lama jadi SUPERSEDED dan detail keduanya saling menautkan
- [ ] Dokumen ARCHIVED/SUPERSEDED tidak muncul di daftar aktif secara default

---

## Phase 4: Permission engine
**User stories**: 25, 27, 28, 35, 36

### What to build
Permission engine deterministik yang menerapkan tabel kebijakan level L1–5 (siapa tahu dokumen ada, siapa bisa membuka) + permission eksplisit per dokumen (USER/ROLE/DIVISION, opsional `expires_at`) + flag OWNER_APPROVAL_REQUIRED. Dicerminkan dengan RLS. L1–2 menampilkan link Drive langsung; L3–5 tidak pernah menampilkan link Drive. Owner dapat mengubah level (diaudit sebagai perubahan permission) dan memberi grant eksplisit. Akses ditolak menampilkan pesan jelas dan diaudit.

### Acceptance criteria
- [ ] Unit test engine mencakup seluruh sel tabel kebijakan level untuk tiap role
- [ ] User divisi lain tidak melihat dokumen L2 divisi lain di daftar maupun via API langsung
- [ ] User HR yang membuka URL dokumen L5 mendapat `ACCESS_DENIED` (UI dan API) dan event diaudit
- [ ] Query langsung ke database dengan sesi user tetap dibatasi RLS
- [ ] Grant eksplisit ke satu user membuat dokumen terlihat/terbuka hanya untuk user itu; grant kedaluwarsa tidak berlaku
- [ ] Dokumen L3–5 tidak pernah mengekspos `external_url` ke user mana pun selain lewat proxy

---

## Phase 5: Pencarian filter
**User stories**: 37, 41

### What to build
Halaman pencarian dengan keyword + filter gabungan (kategori, divisi, level, PIC, status, rentang tanggal, kedaluwarsa) melalui `search_documents`. Hasil selalu dibatasi permission scope user. Versi aktif diprioritaskan; versi lama diberi label.

### Acceptance criteria
- [ ] Kombinasi beberapa filter mengembalikan hasil yang benar
- [ ] Hasil tidak pernah memuat dokumen di luar permission scope (diuji dengan dua user berbeda, query sama)
- [ ] Bila ada beberapa versi, versi ACTIVE di urutan teratas; SUPERSEDED berlabel "tidak berlaku"
- [ ] Response API menyertakan `permission_scope_applied: true`

---

## Phase 6: Koneksi Drive + scan + review
**User stories**: 12, 13, 16, 18, 19, 21
**Butuh**: D2 (admin Google Workspace / akun service)

### What to build
Drive adapter di integration layer. Owner menghubungkan folder/Shared Drive dan menandainya STANDARD atau RESTRICTED. Scan (manual + cron harian) membuat record DRAFT untuk file baru dengan saran dari nama file & metadata Drive; file yang sudah terdaftar dilewati; file yang hilang/pindah ditandai SOURCE_MISSING. Antrean Review Draft: PIC/Owner konfirmasi, koreksi, atau tolak → ACTIVE.

### Acceptance criteria
- [ ] Owner dapat menghubungkan folder test dan melihat status sinkronisasi
- [ ] Scan pertama membuat N draft untuk N file; scan kedua tanpa perubahan membuat 0 draft baru
- [ ] File di folder RESTRICTED menghasilkan draft dengan level default ≥ L3
- [ ] Menghapus file di Drive lalu scan → record bertanda SOURCE_MISSING, tidak terhapus
- [ ] Draft tidak muncul di pencarian sampai dikonfirmasi; konfirmasi mengubah status jadi ACTIVE dan diaudit
- [ ] Cron scan harian berjalan (dapat dipicu manual saat smoke test)

---

## Phase 7: AI saran metadata
**User stories**: 14, 15, 17, 20
**Butuh**: D1 (provider AI)

### What to build
AI adapter (satu interface, satu provider). Saat scan, folder STANDARD: teks yang bisa diekstrak (PDF teks, Google Docs) dikirim ke AI untuk saran jenis, PIC, divisi, level, nomor dokumen, tanggal, ringkasan. Folder RESTRICTED: hanya nama file + metadata Drive yang dikirim. File tak terbaca → saran dari nama file + flag CONTENT_UNREADABLE. Saran disimpan terpisah dan ditampilkan sebagai "saran" di Review Draft.

### Acceptance criteria
- [ ] Draft dari folder STANDARD berisi saran metadata dan ringkasan
- [ ] Untuk folder RESTRICTED, payload ke AI adapter terbukti tidak berisi isi file (diuji di level adapter)
- [ ] File scan gambar / rusak tetap menjadi draft dengan flag CONTENT_UNREADABLE
- [ ] UI review membedakan field saran vs field terkonfirmasi; konfirmasi menyalin saran ke field final
- [ ] Mengganti implementasi adapter (mock provider) tidak memerlukan perubahan di service layer

---

## Phase 8: Buka dokumen L3–5 lewat CSSE
**User stories**: 32

### What to build
`get_authorized_document` + route proxy file: sistem mengambil file dari Shared Drive terbatas via akun service dan menyajikannya ke user berhak (view/download; Google Docs/Sheets native diekspor ke PDF). Read-only. Setiap buka/unduh diaudit.

### Acceptance criteria
- [ ] Owner/PIC dapat membuka file L3–5 lewat CSSE tanpa punya akses Drive langsung
- [ ] User tanpa hak mendapat `ACCESS_DENIED` dari route proxy (tidak ada bypass via ID)
- [ ] Dokumen Google native tersaji sebagai PDF
- [ ] Event `DOCUMENT_OPENED` / `DOCUMENT_DOWNLOADED` tercatat untuk setiap akses

---

## Phase 9: Permintaan akses
**User stories**: 29, 30, 31, 33, 34

### What to build
User mengajukan akses L3–5 dengan alasan → approver ditentukan otomatis oleh aturan (GM/Owner untuk L3, Owner untuk L4–5 dan OWNER_APPROVAL_REQUIRED) → approver menyetujui (durasi 1/7/30 hari) atau menolak (dengan alasan) → grant sementara dibuat → cron mencabut saat kedaluwarsa. GM yang mencoba aksi pada dokumen OWNER_APPROVAL_REQUIRED otomatis membuat request ke Owner. Halaman "Permintaan Saya" dan "Menunggu Saya".

### Acceptance criteria
- [ ] Staf mengajukan akses L3; GM melihatnya di "Menunggu Saya"; setelah disetujui 1 hari, staf bisa membuka via proxy
- [ ] Request L4/L5 hanya muncul di antrean Owner, tidak di GM
- [ ] Setelah `expires_at` lewat (cron dipicu), staf kembali `ACCESS_DENIED`; status request EXPIRED
- [ ] Penolakan menampilkan alasan ke pemohon
- [ ] GM membuka dokumen OWNER_APPROVAL_REQUIRED → request ke Owner terbentuk, aksi tidak dieksekusi
- [ ] Semua langkah tercatat (`APPROVAL_REQUESTED`, `ACCESS_APPROVED`, `ACCESS_REJECTED`, `ACCESS_EXPIRED`)

---

## Phase 10: Ask AI
**User stories**: 38, 39, 40, 42, 43, 50
**Butuh**: D1

### What to build
Chat pencarian bahasa natural. Alur: intent → identity → permission scope → query registry (metadata + ringkasan terkonfirmasi, hanya dokumen dalam scope) → AI menyusun jawaban dengan sitasi record yang bisa diklik. Tanpa embedding/vector, tanpa membaca isi file. Bila tak ada hasil, bilang jujur dan sarankan pencarian filter. Bila provider AI down, tampilkan pesan dan arahkan ke pencarian filter. Setiap query diaudit (`AI_DOCUMENT_QUERIED`).

### Acceptance criteria
- [ ] "cari izin operasional klinik Jakarta terbaru" mengembalikan dokumen ACTIVE yang benar dengan sitasi
- [ ] Konteks yang dikirim ke AI terbukti hanya berisi dokumen dalam permission scope user (diuji di level service)
- [ ] User HR bertanya tentang dokumen Executive → jawaban tidak memuat petunjuk isi/keberadaannya
- [ ] Query tanpa hasil → AI menyatakan tidak menemukan, tidak mengarang
- [ ] Provider AI dimatikan (mock error) → pesan "AI sementara tidak tersedia", pencarian filter tetap jalan
- [ ] Setiap query tercatat di audit

---

## Phase 11: Command Center
**User stories**: 44, 45

### What to build
Dashboard per peran. Owner/GM: Menunggu Approval Saya, Akan Kedaluwarsa (≤90 hari), Draft Perlu Review, Aktivitas Terbaru, Aktivitas Terbatas (akses L3–5). Division User: Permintaan Akses Saya, Dokumen Saya (PIC) yang akan kedaluwarsa, Draft yang ditugaskan ke saya. Semua kartu menghormati permission.

### Acceptance criteria
- [ ] Owner melihat kelima kartu dengan angka yang cocok dengan data
- [ ] Dokumen dengan expiry 60 hari muncul di "Akan Kedaluwarsa"; expiry 120 hari tidak
- [ ] Division User hanya melihat kartu dan item miliknya / dalam scope-nya
- [ ] Klik item kartu membuka halaman terkait

---

## Phase 12: Audit viewer + error state
**User stories**: 46, 47, 48, 49, 51

### What to build
Halaman audit (Owner) dengan filter user, dokumen, aksi, tanggal. Audit append-only: tidak bisa diubah/dihapus via UI, API, maupun sesi DB user. Lengkapi event yang belum tercatat. Degradasi: Drive tidak bisa dijangkau → pencarian metadata tetap jalan, buka file menampilkan error jelas; otorisasi Drive kedaluwarsa/dicabut → peringatan di dashboard Owner.

### Acceptance criteria
- [ ] Filter audit berdasarkan user/dokumen/aksi/tanggal mengembalikan event yang benar
- [ ] Upaya update/delete audit_events oleh user mana pun ditolak (UI, API, dan query DB dengan sesi user)
- [ ] Checklist event PRD story 46 seluruhnya muncul di log setelah smoke test end-to-end
- [ ] Drive adapter dipaksa error → pencarian tetap jalan, buka file menampilkan pesan jelas
- [ ] Kredensial Drive dicabut → kartu peringatan muncul di dashboard Owner
