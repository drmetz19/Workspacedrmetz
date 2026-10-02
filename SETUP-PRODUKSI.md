# Setup produksi — yang dibutuhkan dari Owner

Semua 12 fase MVP sudah jalan & teruji secara lokal (Postgres 16 + adapter `local` / `mock`).
Untuk go-live, isi variabel berikut di Vercel (Project → Settings → Environment Variables).

## 1. Supabase (database + login) — **D3**
1. Buat project Supabase, region **Singapore** (terdekat; cek kepatuhan UU PDP).
2. `DATABASE_URL` = Settings → Database → Connection string (URI). Untuk Vercel pakai **pooler transaction (port 6543)** — app otomatis mematikan prepared statements.
3. Jalankan migrasi sekali dari laptop: `DATABASE_URL=… pnpm db:migrate`, lalu `pnpm db:seed` (membuat Owner pertama dari `CSSE_BOOTSTRAP_OWNER_EMAIL`).
4. `IDENTITY_PROVIDER=supabase`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Settings → API).
5. Supabase → Authentication → Providers → **Google** aktifkan (butuh OAuth Client ID/Secret dari Google Cloud Console). Redirect URL yang diizinkan: `https://<domain-app>/api/auth/google/callback`.
6. Matikan "Enable sign ups" publik di Supabase (CSSE tetap menolak email yang tidak diundang, ini lapisan tambahan).
7. **Hapus** `CSSE_ALLOW_DEV_IDP` di produksi.

> Catatan keamanan: migrasi mencabut semua hak role `anon`/`authenticated` atas tabel CSSE, jadi data tidak bisa dibaca lewat REST API Supabase.

## 2. Google Drive (akun service) — **D2**
1. Google Cloud Console → buat Service Account → buat key JSON.
2. Aktifkan **Google Drive API** di project tersebut.
3. `DRIVE_PROVIDER=google`, `GOOGLE_SERVICE_ACCOUNT_JSON` = isi file JSON (boleh base64).
4. Bagikan folder Legal/Perizinan ke email service account (Viewer).
5. Buat **Shared Drive terbatas** untuk L3–5: anggota hanya service account (+ Owner). Hubungkan sebagai tipe *Terbatas* di menu Sumber Drive.
6. (Opsional) Domain-wide delegation + `GOOGLE_IMPERSONATE_SUBJECT` bila ingin membaca atas nama admin Workspace.

## 3. AI — **D1**
- `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `AI_MODEL` (default `claude-sonnet-5-5`).
- Yang dikirim ke AI: metadata + ringkasan terkonfirmasi (Ask AI) dan isi teks file **hanya dari folder standar** (saran metadata). Isi folder terbatas tidak pernah dikirim.
- Tanpa AI: set `AI_PROVIDER=none` — semua fitur lain tetap jalan; Ask AI menampilkan "AI sementara tidak tersedia".

## 4. Email — **D4**
Undangan, reset password, dan notifikasi approval saat ini masuk tabel `email_outbox`. Untuk produksi perlu penyedia email (SMTP Google Workspace atau Resend) — adapter tinggal ditambah di `src/server/integrations/email`.

## 5. Lain-lain
- `APP_URL=https://<domain-app>`
- `CRON_SECRET` = string acak panjang (dipakai Vercel Cron: scan Drive 02.00 WIB, kedaluwarsa akses 03.00 WIB — lihat `vercel.json`. Plan Hobby hanya mengizinkan cron harian; akses tetap berakhir tepat waktu karena engine memeriksa `expires_at`).
- `CSSE_BOOTSTRAP_OWNER_EMAIL` = email Google dr. Metz.

## Checklist uji setelah kredensial masuk
- [ ] Login Google Owner via Supabase · undang GM & staf · login password staf
- [ ] Hubungkan folder Drive asli → scan → review draft
- [ ] Buka dokumen L3 dari Shared Drive terbatas lewat CSSE
- [ ] Ask AI dengan provider Anthropic
