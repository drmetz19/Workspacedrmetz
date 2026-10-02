# PRD — Dr. Metz Workspace · CSSE (MVP Pilot)

> Turunan dari PRD Foundation v0.2 (2 Okt 2026) setelah sesi grilling. Dokumen ini **mengunci scope MVP pilot**. Prinsip arsitektur v0.2 (API-first, permission sebelum AI, Drive = storage, audit wajib, stable ID) tetap berlaku penuh.
> Tanggal: 2 Oktober 2026 · Status: Draft untuk Gate 2

---

## Problem Statement

Dokumen penting organisasi DrMetz (izin klinik, SIP/STR, kontrak, MoU, sewa) tersebar di Drive pribadi, folder acak, chat, dan ingatan orang. Setiap kali Owner butuh satu dokumen, tim harus bertanya "file ini ada di siapa?", mencari link, menebak versi mana yang berlaku, dan tidak ada jejak siapa yang membuka dokumen sensitif. Dokumen yang hampir kedaluwarsa baru ketahuan setelah terlambat.

## Solution

Mini app web **CSSE** di dalam Dr. Metz Workspace yang menjadi **index + gerbang akses** di atas Google Drive (Google Workspace organisasi):

- Semua dokumen Legal/Perizinan terdaftar di satu registry dengan metadata (jenis, PIC, divisi, level keamanan, versi, tanggal berlaku/kedaluwarsa).
- Dokumen biasa (Level 1–2) tetap dibuka langsung di Drive; dokumen sensitif (Level 3–5) dikunci di Shared Drive terbatas dan **hanya** bisa dibuka lewat CSSE, dengan approval akses dan audit.
- User mencari lewat filter atau bertanya ke AI dengan bahasa natural ("cari izin operasional klinik Jakarta terbaru"); AI hanya melihat metadata dokumen yang boleh diakses user tersebut.
- Command Center menunjukkan apa yang butuh perhatian: approval menunggu, dokumen akan kedaluwarsa, draft yang belum direview.

**Pilot:** Owner (dr. Metz) + GM + divisi **Legal/Perizinan**, ±5–10 user.

---

## User Stories

### Aktor
- **Owner / Super Admin** — dr. Metz; akses tertinggi, mengelola user, approval final.
- **GM** — akses luas lintas divisi sesuai policy; tidak absolut.
- **Division User** — staf Legal/Perizinan; akses sesuai divisi + permission + level.
- **Sistem** — scanner Drive, AI adapter, scheduler.

### A. Login & akses masuk
1. As an Owner, I want to invite a user by email with a role and division, so that only people I choose can enter CSSE.
2. As an invited user, I want to log in with Google Workspace, personal Gmail, or email + password, so that I can use whichever account I have.
3. As an invited user with email + password, I want to reset my password via email, so that I'm not locked out permanently.
4. As an Owner, I want login attempts from uninvited emails to be rejected and recorded in the audit, so that I can see who tried to get in.
5. As an Owner, I want accounts to be temporarily locked after repeated failed password attempts, so that brute-force guessing is blocked.
6. As an Owner, I want Owner and GM accounts restricted to Google login, so that high-privilege accounts use Google's 2FA.
7. As an Owner, I want to deactivate a user, so that their access stops immediately while their history stays in the audit.
8. As a deactivated user, I want a clear "akun dinonaktifkan" message when I try to log in, so that I know to contact admin.

### B. Manajemen organisasi
9. As an Owner, I want to create and edit divisions, so that documents and users can be grouped.
10. As an Owner, I want to change a user's role or division, so that access follows their current job.
11. As an Owner, I want to manage document categories (Izin Operasional, SIP, STR, Kontrak, MoU, Sewa, Sertifikat, Lainnya), so that classification is consistent.

### C. Koneksi Drive & ingest dokumen
12. As an Owner, I want to connect one or more Drive folders / Shared Drives to CSSE and mark each as "standar (L1–2)" or "terbatas (L3–5)", so that the scanner knows where documents live and their baseline sensitivity.
13. As the system, I want to scan connected folders and create a **draft record** for every new file, so that existing documents enter the registry without manual typing.
14. As the system, I want AI to suggest metadata (jenis, PIC, divisi, level, nomor dokumen, tanggal berlaku/kedaluwarsa, ringkasan singkat) for each draft, so that reviewers only confirm instead of typing.
15. As the system, for files in a **restricted** folder, I want AI suggestions based on filename and Drive metadata only (no file content sent to the AI provider), and the level to default to minimum L3, so that sensitive content never leaves to an external model during ingest.
16. As a PIC or Owner, I want a "Review Draft" queue where I can confirm, correct, or reject each suggestion, so that nothing becomes searchable without human verification.
17. As a reviewer, I want AI suggestions visibly marked as suggestions (not facts), so that I don't confirm them blindly.
18. As an Owner, I want to trigger a manual re-scan and also have a daily automatic scan, so that new or changed files are picked up.
19. As the system, when a registered file is deleted or moved out of a connected folder, I want to mark the record "sumber hilang" instead of deleting it, so that the registry and audit stay intact.
20. As the system, when a file can't be read (scan image, corrupted, unsupported), I want to still create a draft with filename-based suggestions and flag "isi tidak terbaca", so that it still enters review.
21. As the system, I want to ignore files already registered (same external resource ID), so that rescans never create duplicates.

### D. Registry & versi
22. As a user, I want to see a document's detail page (metadata, PIC, level, status, versi, tanggal, riwayat), so that I know if it's the valid version.
23. As a PIC, I want to mark a new document as superseding an older one, so that the old one becomes "tidak berlaku" and searches prefer the active version.
24. As a PIC/Owner, I want to edit metadata of documents I'm permitted to edit, so that data stays accurate; every change is audited.
25. As an Owner, I want to change a document's security level, so that classification can be corrected; this is audited as a permission change.
26. As an Owner, I want to archive a document, so that it leaves active lists but remains in the registry.

### E. Akses & permission
27. As a Division User, I want to see and open L1–2 documents of my division directly via their Drive link, so that daily work isn't slowed.
28. As a Division User, I want L3–5 documents to appear in search results only if policy allows me to know they exist, and to open them only after approval, so that sensitive files stay protected.
29. As a Division User, I want to request access to an L3–5 document with a reason, so that I can get legitimate access.
30. As an approver (GM for L3; Owner for L4–5 and anything marked OWNER_APPROVAL_REQUIRED), I want to approve or reject requests and set a duration (1 hari / 7 hari / 30 hari), so that access is temporary.
31. As a requester, I want to see my request status (pending / approved until X / rejected + reason), so that I know where I stand.
32. As a user with approved temporary access, I want to view/download the L3–5 file **through CSSE** (served by the system, not a Drive link), so that access can expire and every open is logged.
33. As the system, I want temporary access to expire automatically, so that nobody keeps sensitive access forever.
34. As a GM, when I try an action on a document marked OWNER_APPROVAL_REQUIRED, I want the system to create a request to the Owner instead of executing, so that Owner-only decisions stay with the Owner.
35. As a user without permission, I want a clear "akses ditolak" message (with option to request access where allowed), so that I'm not confused; the denial is audited.
36. As an Owner, I want to grant explicit permission on a specific document to a specific user/role/division, so that exceptions are possible without changing levels.

### F. Pencarian
37. As a user, I want structured search with combinable filters (keyword, kategori, divisi, level, PIC, status, rentang tanggal, kedaluwarsa), so that I can narrow results precisely.
38. As a user, I want to ask in natural language ("cari izin operasional klinik Jakarta terbaru"), so that I don't need to know folders or filters.
39. As the system, I want AI search to receive only metadata + confirmed summaries of documents the user is permitted to see — filtering happens **before** context reaches the model, so that AI access never exceeds user access.
40. As a user, I want AI answers to cite the document records they're based on (clickable), so that I can verify.
41. As a user, when multiple versions exist, I want the active version prioritized and older versions labeled, so that I use the right one.
42. As a user, when nothing matches, I want the AI to say so plainly and suggest filter search, so that it never invents documents.
43. As a user asking about a document I'm not permitted to see, I want the AI to behave as if it doesn't exist (no hints of content), so that protected info doesn't leak.

### G. Command Center
44. As an Owner/GM, I want a home dashboard with: Menunggu Approval Saya, Akan Kedaluwarsa (≤90 hari), Draft Perlu Review, Aktivitas Terbaru, Aktivitas Terbatas (akses L3–5), so that I see what needs attention first.
45. As a Division User, I want my own dashboard: Permintaan Akses Saya, Dokumen Saya (sebagai PIC) yang akan kedaluwarsa, Draft yang ditugaskan ke saya, so that I see my tasks.

### H. Audit
46. As an Owner, I want every significant event recorded (login berhasil/gagal/ditolak, dokumen dibuat/diubah/dibuka/diunduh, akses ditolak, permintaan/approval/penolakan, perubahan permission/level, query AI), with who/what/when/akun/resource/hasil, so that there's a complete trail.
47. As an Owner, I want to filter the audit log by user, document, action, and date, so that I can investigate.
48. As any non-Owner user, I must not be able to edit or delete audit events, so that the trail is trustworthy.

### I. Error & edge state
49. As a user, when Google Drive is unreachable, I want metadata search to still work and file opening to show a clear error, so that the app degrades gracefully.
50. As a user, when the AI provider is down, I want structured search to still work and a message that AI search is temporarily unavailable, so that work continues.
51. As an Owner, when the Drive connection's authorization expires or is revoked, I want a visible warning on the dashboard, so that scanning doesn't silently stop.

---

## Implementation Decisions

### Stack & arsitektur
- **Next.js + TypeScript**, **Supabase** (Postgres + Auth), hosting **Vercel**. Modular monolith, sejalan dengan Master PRD DrMetz Ecosystem.
- Tooling: pnpm, `tsc` typecheck, vitest.
- Lapisan logis: UI → **Service layer** (semua business logic, permission check, audit) → **Integration layer** (Drive adapter, AI adapter). UI dan AI **tidak pernah** memanggil Drive atau provider AI langsung.
- Service layer memiliki kontrak fungsi yang stabil dan dinamai seperti tool capability v0.2 (`search_documents`, `get_document_metadata`, `get_authorized_document`, `create_document_record`, `update_document_metadata`, `request_document_access`, `approve_access_request`, `reject_access_request`, `list_pending_approvals`, `get_audit_history`). Setiap fungsi: terima identity context → authorization → action → structured response → audit event. Ini fondasi untuk MCP di fase 2.
- **Row Level Security** di Postgres sebagai lapisan pertahanan kedua; permission engine di service layer tetap sumber keputusan utama.

### Identitas & login
- Supabase Auth dengan tiga metode: Google OAuth (Workspace & Gmail biasa) dan email + password.
- **Invite-only**: hanya email yang terdaftar oleh Owner bisa masuk; tanpa self sign-up.
- Owner & GM wajib login Google.
- Lockout sementara setelah percobaan password gagal berulang; reset password via email.
- Tabel user punya `user_id` internal (stabil) + `drmetz_identity_id` nullable untuk DrMetz ID kelak.
- Undangan = baris user berstatus `INVITED` (bukan tabel terpisah); status menjadi `ACTIVE` saat login pertama.
- Sesi dikelola CSSE sendiri (cookie httpOnly, 12 jam) — independen dari identity provider, sehingga provider bisa diganti (Supabase → DrMetz ID) tanpa mengubah service.
- Identity provider lewat adapter: `supabase` (produksi) dan `local` (pengembangan: password bcrypt di DB + simulasi layar Google, hanya aktif bila `CSSE_ALLOW_DEV_IDP=1`).
- Token undangan/reset password dibuat & divalidasi CSSE (sekali pakai, kedaluwarsa 72 jam / 60 menit); lockout 15 menit setelah 5 kali gagal; reset password juga membuka kunci.
- Email lewat adapter; MVP memakai `outbox` (tabel email_outbox). Penyedia email produksi = **D4**.

### Data model (mengikuti v0.2, disederhanakan untuk pilot)
- **User**, **Role** (Owner, GM, Division User — extensible), **Division**, **Category**.
- **Document**: `document_id` internal sebagai identitas utama; `external_provider`, `external_resource_id` (Drive file ID), `external_url`, nama, kategori, divisi, level, owner, PIC, status, versi, `supersedes_document_id`, tanggal berlaku, tanggal kedaluwarsa, ringkasan terkonfirmasi, nomor dokumen, sumber folder.
- Status dokumen: `DRAFT` (hasil scan, belum direview) → `ACTIVE` → `SUPERSEDED` / `ARCHIVED`; plus flag `SOURCE_MISSING` dan `CONTENT_UNREADABLE`.
- **AI suggestion** disimpan terpisah dari metadata terkonfirmasi (field saran vs field final), supaya jelas mana yang sudah diverifikasi manusia.
- **Permission** (resource-level): principal USER / ROLE / DIVISION; tipe VIEW, OPEN, DOWNLOAD, EDIT_METADATA, MANAGE_PERMISSION, APPROVE; `expires_at` untuk akses sementara.
- **Access Request**: requester, dokumen, alasan, approver yang ditentukan, status (PENDING/APPROVED/REJECTED/EXPIRED), durasi, alasan penolakan.
- **Audit Event** append-only: actor, email akun, action, resource, timestamp, result, source (UI/AI/system), metadata.
- **Drive Source**: folder/Shared Drive yang terhubung + tipe (standar / terbatas) + status sinkronisasi terakhir.

### Kebijakan level keamanan (default pilot)
| Level | Siapa tahu dokumen ada (muncul di hasil) | Siapa bisa buka | Cara buka |
|---|---|---|---|
| L1 Internal | Semua user | Semua user | Link Drive langsung |
| L2 Controlled | Divisi terkait + GM + Owner | Sama | Link Drive langsung |
| L3 Confidential | Divisi terkait + GM + Owner | PIC + GM + Owner; lainnya via request (approver: GM atau Owner) | Lewat CSSE |
| L4 Restricted | GM + Owner + PIC | Owner + PIC; GM & lainnya via request (approver: Owner) | Lewat CSSE |
| L5 Executive | Owner (+ grant eksplisit) | Owner; lainnya via request (approver: Owner) | Lewat CSSE |
- Flag `OWNER_APPROVAL_REQUIRED` bisa dipasang per dokumen; menimpa approver menjadi Owner, dan GM kehilangan hak default membuka/mengubah dokumen tersebut (harus lewat persetujuan Owner).
- PIC selalu termasuk "boleh tahu" untuk L1–4; dokumen L5 hanya Owner kecuali grant eksplisit.
- Untuk yang boleh tahu tetapi belum boleh membuka: nama, kategori, level, PIC, tanggal tampil; **nomor dokumen dan ringkasan disembunyikan**.
- Level saat mendaftarkan dibatasi: Division User maks L3, GM maks L4, Owner L1–5 (menaikkan level setelahnya = Owner). Division User yang mendaftarkan tanpa PIC otomatis menjadi PIC.
- Tautan Drive L3–5 tidak pernah dikirim ke browser siapa pun (termasuk Owner) — hanya lewat proxy CSSE. File Drive ID hanya ditampilkan ke Owner.
- Grant eksplisit: Lihat metadata / Buka / Ubah metadata, untuk User / Divisi / Role, opsional tanggal berakhir; dicabut = `revoked_at` (tidak dihapus).
- Kebijakan "boleh tahu" juga diimplementasikan sebagai fungsi Postgres `csse_can_view_document` dan dipakai oleh RLS + query daftar; paritas dengan engine TypeScript diuji otomatis.
- Hardening Supabase: semua hak role `anon`/`authenticated` pada tabel & fungsi CSSE dicabut (data tidak bisa dibaca lewat REST API Supabase).
- Permission eksplisit per dokumen dapat menambah akses di atas default.
- Keputusan akses **deterministik** — tidak pernah diputuskan oleh LLM.

### Google Drive
- Akses Drive lewat **akun service / domain-wide delegation** milik Google Workspace organisasi.
- Folder **standar** (L1–2): file tetap di Drive biasa; CSSE hanya index + link.
- Folder **terbatas** (L3–5): Shared Drive yang hanya bisa diakses akun service CSSE + Owner. File dibuka user lewat CSSE: sistem mengambil file dan menyajikan view/download (file Google Docs/Sheets native diekspor ke PDF). Akses read-only — mengedit file L3–5 tidak lewat CSSE di MVP. Respons proxy `no-store`; hanya PDF/gambar/teks yang ditampilkan inline, tipe lain (mis. HTML) selalu diunduh agar tidak berjalan di origin aplikasi. File yang tidak ditemukan saat dibuka otomatis ditandai "sumber hilang".
- Deteksi perubahan: re-scan manual + scan otomatis harian (Vercel Cron 02.00 WIB, dilindungi `CRON_SECRET`); dedupe berdasarkan `external_resource_id`.
- Akses Drive lewat adapter: `google` (Drive API v3, akun service read-only, opsional domain-wide delegation) dan `mock` (pengembangan/test).
- Saat menghubungkan folder, CSSE memverifikasi aksesnya; untuk folder terbatas, CSSE mencatat siapa saja yang masih punya akses Drive selain akun CSSE dan menampilkan peringatan.
- Draft yang ditolak berstatus `REJECTED` (tetap tersimpan) sehingga scan berikutnya tidak membuatnya ulang. Dokumen manual yang file-nya ditemukan saat scan ditautkan ke sumber (tidak diduplikasi).
- Konfirmasi draft dari folder terbatas wajib ≥ L3; draft dari folder standar hanya Owner yang boleh mengonfirmasi sebagai L3–5 (karena file masih bisa dibuka langsung di Drive).

### AI
- Satu **AI adapter** (interface tunggal) dengan satu provider di MVP.
- Dipakai untuk dua hal saja: (1) saran metadata saat ingest, (2) Ask AI search.
- Saat ingest: folder standar → AI membaca teks yang bisa diekstrak (PDF teks, Google Docs); folder terbatas → hanya nama file + metadata Drive. Tanpa OCR.
- Ask AI: alur **intent → identity → permission scope → query registry (metadata + ringkasan terkonfirmasi) → model menyusun jawaban + sitasi record**. Tanpa embedding, tanpa vector DB, tanpa membaca isi file saat query.
- Semua query AI dicatat di audit.
- Arsitektur: service → **AI orchestrator** (satu-satunya tempat prompt dibangun & keluaran divalidasi skema) → **provider adapter** (`anthropic` | `mock` | `none`, dipilih via `AI_PROVIDER`). Isi dokumen diperlakukan sebagai data (anti prompt-injection); keluaran AI di luar daftar kategori/divisi/orang dibuang, tanggal tidak valid dibuang, level folder terbatas dipaksa ≥ L3.
- Kegagalan AI tidak menggagalkan scan — draft tetap dibuat dengan saran heuristik nama file.
- Ekstraksi teks: Google Docs/Sheets/Slides (export teks), PDF teks (parser ringan internal), txt. Gambar/PDF scan → `CONTENT_UNREADABLE` (tanpa OCR).

### Desain UI
- Mengikuti mockup Stitch "Application Mockup Generator" (Clinical Governance Workspace): Command Center berisi kartu ringkasan, grid divisi + PIC, tabel "Perlu Perhatian Segera", bar Tanya AI; layar Persetujuan dengan tab + panel ringkasan.
- Elemen mockup di luar scope MVP tidak dibuat tiruan: tanda tangan elektronik, "audit log kripto / SHA-256", approval kontrak/surat (hanya permintaan akses L3–5), angka dummy.

### Command Center & navigasi MVP
- Command Center (dashboard per peran), Dokumen (Semua, Milik Saya, Divisi, Draft Review, Terbatas), Pencarian (Filter, Ask AI), Akses (Permintaan Saya, Menunggu Saya), Aktivitas/Audit (Owner), Administrasi (User & undangan, Divisi, Kategori, Sumber Drive).

---

## Out of Scope (MVP)
- Correspondence (surat/memo top-down & bottom-up), outbox/inbox.
- Workflow engine yang bisa dikonfigurasi; approval jenis lain selain permintaan akses L3–5.
- Integrasi Gmail.
- Server MCP (service layer sudah siap dibungkus di fase 2).
- Lebih dari satu provider AI aktif; local model.
- Embedding, vector search, Q&A atas isi file, OCR.
- Reminder kedaluwarsa via email/WhatsApp (MVP: tampil di dashboard saja).
- DrMetz ID terpusat (hanya disiapkan kolomnya).
- Divisi selain Legal/Perizinan, multi business unit.
- Editor dokumen sendiri, pengganti Google Drive, migrasi semua file lama sekaligus.
- Tanda tangan digital, mobile app native, portal partner eksternal.

---

## Further Notes

### Keputusan terkunci dari grilling (2 Okt 2026)
1. Pilot: Owner + GM + 1 divisi, ±5–10 user.
2. Divisi pilot: Legal/Perizinan.
3. Organisasi memakai Google Workspace bisnis.
4. Model akses hybrid: L3–5 di Shared Drive terkunci, hanya via CSSE; L1–2 tetap langsung di Drive.
5. Ingest: scan otomatis → AI sarankan metadata → PIC/Admin konfirmasi → aktif.
6. Ask AI paling sederhana: metadata + ringkasan terkonfirmasi saja.
7. Approval MVP: satu jenis — permintaan akses L3–5.
8. Login: Google Workspace, Gmail biasa, email + password → satu `user_id` internal.
9. Masuk hanya lewat undangan.
10. Stack: Next.js + TypeScript.
11. Fondasi service layer + AI adapter sekarang; server MCP & multi-provider fase 2.

### Asumsi yang diambil tanpa ditanyakan (koreksi bila perlu)
- **A1.** Supabase + Vercel ikut sebagai backend/hosting (user hanya mengonfirmasi Next.js + TypeScript secara eksplisit).
- **A2.** Tabel kebijakan level keamanan di atas (siapa melihat/membuka/menyetujui per level).
- **A3.** Durasi akses sementara: pilihan 1 / 7 / 30 hari, dipilih approver.
- **A4.** Dokumen L3–5 dibuka via CSSE (disajikan sistem, read-only), bukan dengan memberi izin Drive sementara ke akun user.
- **A5.** Folder terbatas tidak mengirim isi file ke provider AI saat ingest; level default minimal L3.
- **A6.** Owner bertindak sebagai Admin di pilot (tidak ada role Admin terpisah).
- **A7.** Reminder kedaluwarsa hanya di dashboard (≤90 hari); notifikasi email ditunda.
- **A8.** Scan otomatis sekali sehari + tombol scan manual.
- **A9.** Batas level saat pendaftaran (DU ≤ L3, GM ≤ L4) dan nomor/ringkasan disembunyikan bagi yang belum boleh membuka.

### DECISION REQUIRED
- **D1.** Provider AI pertama (rekomendasi: Anthropic Claude via adapter). Perlu dipastikan juga kebijakan pengiriman data dokumen klinik ke provider eksternal.
- **D2.** Siapa yang menjadi akun service / admin Workspace yang mengizinkan akses Drive (butuh admin Google Workspace organisasi).
- **D4.** Penyedia email transaksional untuk undangan & reset password (mis. SMTP Google Workspace atau Resend).
- **D3.** Region data Supabase (rekomendasi: Singapore, terdekat dengan Indonesia) dan kepatuhan terhadap UU PDP.

### Metrik sukses pilot
- Median waktu menemukan dokumen yang benar (target: < 1 menit tanpa bertanya orang lain).
- % dokumen Legal/Perizinan yang terdaftar dengan PIC, level, dan tanggal kedaluwarsa.
- Jumlah dokumen yang terdeteksi akan kedaluwarsa sebelum lewat tanggal.
- % jawaban Ask AI yang mengembalikan dokumen benar dan berhak diakses.
- 0 kebocoran: tidak ada akses L3–5 tanpa approval/permission yang tercatat.

---

## Changelog
- 2026-10-02 · Phase 8 · Proxy file memaksa unduh untuk tipe non-aman & menandai sumber hilang saat file tidak ditemukan — alasan: mencegah XSS dari file Drive dan menjaga status registry akurat.
- 2026-10-02 · Phase 7 · Ditambah provider `mock` deterministik untuk dev/test dan mode `none` (AI nonaktif) — alasan: D1 (provider & kebijakan data) belum diputuskan; alur tetap teruji end-to-end tanpa mengirim data ke vendor.
- 2026-10-02 · Phase 6 · Ditambah status `REJECTED`, tabel `document_suggestions` (saran terpisah dari field final), pemeriksaan siapa yang masih punya akses ke folder terbatas, aturan level saat konfirmasi draft — alasan: edge case scan ulang & mencegah dokumen sensitif tetap terbuka di Drive.
- 2026-10-02 · Phase 5 · Kata kunci dicocokkan pada data yang sudah diamankan izin (nomor & ringkasan dokumen yang belum boleh dibuka tidak ikut dicari); pencarian juga mencocokkan nama PIC/kategori/divisi; sidebar per divisi → pencarian per divisi. UI di-restyle mengikuti design system Stitch dari Owner — alasan: mencegah kebocoran isi lewat kata kunci; permintaan desain Owner.
- 2026-10-02 · Phase 4 · Engine izin dilengkapi aturan yang tidak tertulis di tabel level: GM kehilangan hak default pada dokumen OWNER_APPROVAL_REQUIRED, metadata sensitif disembunyikan bagi yang hanya 'boleh tahu', batas level saat pendaftaran per role, auto-PIC untuk Division User, cabut hak REST Supabase — alasan: menutup celah kebocoran & mencegah pembuat dokumen terkunci dari dokumennya sendiri. Perlu konfirmasi Owner (lihat A9).
- 2026-10-02 · Phase 3 · Riwayat dokumen diambil dari audit event (bukan tabel riwayat terpisah); tautan Drive apa pun bentuknya (file/Docs/Sheets/open?id=) dinormalisasi ke file ID untuk deteksi duplikat; satu dokumen hanya bisa digantikan satu versi (rantai linear) — alasan: audit sudah menjadi sumber kebenaran, dan duplikat link berbeda-bentuk harus tertangkap.
- 2026-10-02 · Phase 2 · Ditambah: aktifkan kembali user nonaktif, Owner tidak bisa menurunkan role sendiri, divisi/kategori bisa dinonaktifkan (tidak dihapus) — alasan: edge case administrasi yang muncul saat implementasi; menjaga riwayat dan mencegah Owner terkunci dari admin.
- 2026-10-02 · Phase 1 · Undangan disimpan sebagai user `INVITED`, sesi milik CSSE, identity & email lewat adapter (local/outbox untuk dev) — alasan: Supabase belum tersedia dan login harus bisa diganti provider tanpa mengubah logika undangan/lockout/audit. Ditambah D4 (penyedia email).
- 2026-10-02 · Grilling · Scope MVP dipersempit dari 18 must-have (v0.2) menjadi pilot Legal/Perizinan; correspondence, workflow engine, Gmail, MCP server, vector search dipindah ke fase 2 — alasan: memvalidasi fondasi (registry, permission, audit, search) dengan user nyata sebelum membangun lapisan berikutnya.
- 2026-10-02 · Plan · Plan disusun 12 fase; fitur versi (story 23) digabung ke fase Registry — alasan: slice terlalu kecil untuk berdiri sendiri.
