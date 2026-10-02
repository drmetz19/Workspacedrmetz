-- Phase 6 — Koneksi Google Drive, scan, antrean review draft

create table drive_sources (
  source_id            uuid primary key default gen_random_uuid(),
  name                 text not null,
  provider             text not null default 'GOOGLE_DRIVE' check (provider in ('GOOGLE_DRIVE')),
  container_kind       text not null default 'FOLDER' check (container_kind in ('FOLDER','SHARED_DRIVE')),
  external_id          text not null,                          -- folder ID / shared drive ID
  external_url         text,
  source_type          text not null check (source_type in ('STANDARD','RESTRICTED')),
  default_division_id  uuid references divisions(division_id),
  status               text not null default 'ACTIVE' check (status in ('ACTIVE','DISABLED')),
  auth_status          text not null default 'UNKNOWN' check (auth_status in ('UNKNOWN','OK','ERROR')),
  last_scan_at         timestamptz,
  last_scan_status     text check (last_scan_status in ('OK','ERROR')),
  last_scan_error      text,
  last_scan_stats      jsonb not null default '{}'::jsonb,
  shared_with          jsonb not null default '[]'::jsonb,     -- principal selain CSSE (peringatan untuk folder terbatas)
  created_by           uuid references users(user_id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (provider, external_id)
);

alter table documents add constraint documents_source_fk foreign key (source_id) references drive_sources(source_id);
alter table documents add column external_modified_at timestamptz;
alter table documents add column external_mime_type text;
alter table documents add column reviewed_by uuid references users(user_id);
alter table documents add column reviewed_at timestamptz;
alter table documents add column review_note text;

-- Draft yang ditolak saat review → REJECTED (tetap disimpan agar scan berikutnya tidak membuat ulang).
alter table documents drop constraint documents_status_check;
alter table documents add constraint documents_status_check check (status in ('DRAFT','ACTIVE','SUPERSEDED','ARCHIVED','REJECTED'));

-- Saran metadata (heuristik nama file / AI) disimpan TERPISAH dari field final yang dikonfirmasi manusia.
create table document_suggestions (
  suggestion_id   uuid primary key default gen_random_uuid(),
  document_id     uuid not null references documents(document_id),
  source          text not null check (source in ('HEURISTIC','AI')),
  provider        text,                                       -- mis. "mock", "anthropic:claude-…"
  input_scope     text not null check (input_scope in ('FILENAME_METADATA','CONTENT')),
  fields          jsonb not null default '{}'::jsonb,         -- documentName, categoryName, securityLevel, expiryDate, ...
  created_at      timestamptz not null default now()
);
create index document_suggestions_doc_idx on document_suggestions(document_id, created_at desc);

-- Adapter Drive "mock" (pengembangan & smoke test) — meniru isi folder Drive.
create table dev_drive_files (
  container_id   text not null,
  file_id        text primary key,
  name           text not null,
  mime_type      text not null default 'application/pdf',
  modified_at    timestamptz not null default now(),
  text_content   text,
  content        bytea,
  trashed        boolean not null default false
);

-- "Boleh tahu" untuk REJECTED sama dengan DRAFT (hanya Owner, GM, PIC).
create or replace function csse_can_view_document(p_doc documents, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from users u
    where u.user_id = p_user and u.status = 'ACTIVE'
      and (
        u.role_id = 'OWNER'
        or (p_doc.status in ('DRAFT','REJECTED') and (u.role_id = 'GM' or p_doc.pic_user_id = u.user_id))
        or (p_doc.status not in ('DRAFT','REJECTED') and (
              p_doc.security_level = 1
           or (p_doc.security_level in (2, 3) and (u.role_id = 'GM' or p_doc.pic_user_id = u.user_id or (u.division_id is not null and p_doc.division_id = u.division_id)))
           or (p_doc.security_level = 4 and (u.role_id = 'GM' or p_doc.pic_user_id = u.user_id))
           or exists (
                select 1 from permissions g
                where g.resource_type = 'DOCUMENT' and g.resource_id = p_doc.document_id
                  and g.revoked_at is null and (g.expires_at is null or g.expires_at > now())
                  and g.permission_type in ('VIEW','OPEN','DOWNLOAD','EDIT_METADATA')
                  and ((g.principal_type = 'USER' and g.principal_id = u.user_id::text)
                    or (g.principal_type = 'ROLE' and g.principal_id = u.role_id)
                    or (g.principal_type = 'DIVISION' and g.principal_id = u.division_id::text))
              )
        ))
      )
  )
$$;

grant select on drive_sources, document_suggestions to csse_app_user;
