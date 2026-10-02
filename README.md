# Dr. Metz Workspace — CSSE

Mini app document governance (pilot Legal/Perizinan). PRD: `plans/prd-csse-workspace.md` · Plan: `plans/csse-workspace.md`.

## Menjalankan lokal

```bash
pnpm install
cp .env.example .env.local        # isi DATABASE_URL
pnpm db:migrate && pnpm db:seed   # buat skema + Owner pertama
pnpm dev                          # http://localhost:3000
```

Mode lokal (`IDENTITY_PROVIDER=local`) menyimulasikan layar login Google — cukup ketik email yang diundang.

## Pengujian

```bash
pnpm typecheck
pnpm test             # unit/integration test (DB csse_test dibuat ulang otomatis)
pnpm build && pnpm smoke      # smoke test end-to-end semua fase (DB csse_smoke)
pnpm smoke 3                  # satu fase
```
