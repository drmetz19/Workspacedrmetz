-- Phase 18 — Upload berkas dokumen (selain tautan Google Drive)
-- Berkas disimpan di Supabase Storage bucket privat `csse-documents`. Bucket tidak publik dan
-- tidak punya policy untuk anon/authenticated: hanya server CSSE (service role) yang bisa membaca/menulis.
-- User membuka berkas lewat /api/files/{id} → CSSE memeriksa izin + mencatat audit → URL bertanda tangan 60 detik.

alter table documents drop constraint documents_external_provider_check;
alter table documents add constraint documents_external_provider_check
  check (external_provider in ('GOOGLE_DRIVE', 'CSSE_STORAGE'));

-- external_resource_id = path objek di bucket (untuk CSSE_STORAGE); external_mime_type sudah ada (0005).
alter table documents add column file_name text;
alter table documents add column file_size bigint check (file_size is null or file_size >= 0);

-- Bucket hanya dibuat bila skema storage Supabase tersedia (database lokal/test tidak punya).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('csse-documents', 'csse-documents', false, 26214400, array[
      'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ])
    on conflict (id) do nothing;
  end if;
end $$;
