# Dr. Metz Workspace — CSSE

Mini app **document governance** untuk pilot Legal/Perizinan: registry dokumen di atas Google Drive, izin per level L1–5, permintaan akses, pencarian filter & Ask AI, Command Center, notulensi rapat & tindak lanjut, dan audit append-only.

- PRD MVP: `plans/prd-csse-workspace.md` · Plan 17 fase: `plans/csse-workspace.md` · PRD fondasi: `plans/PRD_foundation_v0.2.md`
- Go-live: `SETUP-PRODUKSI.md`

## Arsitektur singkat
```
UI (Next.js App Router, server components + form HTML)
  → Route handlers /api/* (JSON untuk app lain, redirect untuk form)
    → Service layer (src/server/services) — kontrak MCP-ready: search_documents, get_document_metadata,
      get_authorized_document, create_document_record, update_document_metadata, request_document_access,
      approve_access_request, reject_access_request, list_pending_approvals, get_audit_history
      → Permission engine (src/server/permissions) + RLS Postgres (csse_can_view_document)
      → AI orchestrator (src/server/ai) → provider adapter (anthropic | mock | none)
      → Integration adapters: identity (supabase | local), drive (google | mock), email (outbox)
```

## Menjalankan lokal
```bash
pnpm install
cp .env.example .env.local        # DATABASE_URL Postgres lokal; IDENTITY_PROVIDER=local, DRIVE_PROVIDER=mock, AI_PROVIDER=mock
pnpm db:migrate && pnpm db:seed   # skema + Owner pertama (CSSE_BOOTSTRAP_OWNER_EMAIL)
pnpm dev                          # http://localhost:3000 — "Masuk dengan Google" → layar simulasi, ketik email Owner
```
Mode mock Drive: isi tabel `dev_drive_files` (container_id = ID folder diawali `mock-`) lalu hubungkan folder itu di Administrasi → Sumber Drive.

## Pengujian
```bash
pnpm typecheck
pnpm test                 # 172 test integrasi (DB csse_test dibuat ulang otomatis)
pnpm build && pnpm smoke  # smoke end-to-end 17 fase terhadap build produksi (DB csse_smoke)
pnpm smoke 4,9            # fase tertentu
```
