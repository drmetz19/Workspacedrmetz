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

## 2. Google Drive — mode tautan (D2 diputuskan)
Tidak perlu akun service.
1. Di Vercel set `DRIVE_PROVIDER=link`.
2. Di Google Drive, klik **Bagikan** pada file/folder dan atur siapa yang boleh membuka. Untuk L3–5 bagikan **hanya** ke orang yang berwenang (jangan "Siapa saja yang memiliki link").
3. Salin tautannya → di CSSE **Tambah dokumen** → tempel di kolom "Tautan Google Drive (file atau folder)".
4. CSSE menyaring siapa yang bisa melihat dokumen di direktori dan mencatat setiap pembukaan di audit; izin membuka file tetap dari Drive.

> Mode akun service (`DRIVE_PROVIDER=google` + `GOOGLE_SERVICE_ACCOUNT_JSON`) masih tersedia bila nanti ingin scan folder otomatis & proxy L3–5.

## 3. AI — **D1**
- `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `AI_MODEL` (default `claude-sonnet-5-5`).
- Yang dikirim ke AI: metadata + ringkasan terkonfirmasi (Ask AI) dan isi teks file **hanya dari folder standar** (saran metadata). Isi folder terbatas tidak pernah dikirim.
- Tanpa AI: set `AI_PROVIDER=none` — semua fitur lain tetap jalan; Ask AI menampilkan "AI sementara tidak tersedia".

## 4. Email — Gmail projectcuan15@gmail.com (D4 diputuskan)
1. Login ke akun Google **projectcuan15@gmail.com** → myaccount.google.com → **Keamanan** → aktifkan **Verifikasi 2 Langkah**.
2. Buka myaccount.google.com/apppasswords → buat **Sandi aplikasi** (nama: CSSE) → salin 16 karakternya (tanpa spasi).
3. Di Vercel set: `EMAIL_PROVIDER=smtp`, `SMTP_USER=projectcuan15@gmail.com`, `SMTP_PASS=<sandi aplikasi>` (host default `smtp.gmail.com`, port 465). Redeploy.
4. Pengirim tampil sebagai "Dr. Metz Workspace" <projectcuan15@gmail.com>. Salinan setiap email tetap disimpan di tabel `email_outbox`; bila kirim gagal, undangan tetap dibuat.

## 5. Lain-lain
- `APP_URL=https://<domain-app>`
- `CRON_SECRET` = string acak panjang (dipakai Vercel Cron: scan Drive 02.00 WIB, kedaluwarsa akses 03.00 WIB — lihat `vercel.json`. Plan Hobby hanya mengizinkan cron harian; akses tetap berakhir tepat waktu karena engine memeriksa `expires_at`).
- `CSSE_BOOTSTRAP_OWNER_EMAIL` = email Google dr. Metz.

## Checklist uji setelah kredensial masuk
- [ ] Login Google Owner via Supabase · undang GM & staf · login password staf
- [ ] Daftarkan dokumen dengan tautan Drive asli → buka sebagai user berwenang (Drive mengizinkan) & tidak berwenang (CSSE menolak)
- [ ] Undang staf → email undangan masuk dari projectcuan15@gmail.com
- [ ] Ask AI dengan provider Anthropic
