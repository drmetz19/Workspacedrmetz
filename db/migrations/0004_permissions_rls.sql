-- Phase 4 — Permission engine: grant eksplisit, kebijakan level (SQL), Row Level Security

-- ── Grant eksplisit per resource ────────────────────────────────────────
create table permissions (
  permission_id    uuid primary key default gen_random_uuid(),
  resource_type    text not null default 'DOCUMENT' check (resource_type in ('DOCUMENT')),
  resource_id      uuid not null,
  principal_type   text not null check (principal_type in ('USER','ROLE','DIVISION')),
  principal_id     text not null,                       -- user_id / role_id / division_id
  permission_type  text not null check (permission_type in ('VIEW','OPEN','DOWNLOAD','EDIT_METADATA','MANAGE_PERMISSION','APPROVE')),
  granted_by       uuid references users(user_id),
  reason           text,
  source           text not null default 'MANUAL' check (source in ('MANUAL','ACCESS_REQUEST')),
  created_at       timestamptz not null default now(),
  expires_at       timestamptz,
  revoked_at       timestamptz,
  revoked_by       uuid references users(user_id)
);
create index permissions_resource_idx on permissions(resource_type, resource_id);
create index permissions_principal_idx on permissions(principal_type, principal_id);

-- ── Kebijakan "siapa boleh TAHU dokumen ada" (cermin dari permissions/engine.ts) ─
-- L1: semua user · L2–3: divisi terkait + GM + Owner + PIC · L4: GM + Owner + PIC · L5: Owner
-- Ditambah grant eksplisit aktif (VIEW/OPEN/DOWNLOAD/EDIT_METADATA) untuk USER/ROLE/DIVISION.
-- DRAFT hanya untuk Owner, GM, dan PIC (antrean review).
create or replace function csse_can_view_document(p_doc documents, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from users u
    where u.user_id = p_user and u.status = 'ACTIVE'
      and (
        u.role_id = 'OWNER'
        or (p_doc.status = 'DRAFT' and (u.role_id = 'GM' or p_doc.pic_user_id = u.user_id))
        or (p_doc.status <> 'DRAFT' and (
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

-- ── Row Level Security (lapisan pertahanan kedua) ───────────────────────
-- Query atas nama user dijalankan dengan `set local role csse_app_user` + `csse.user_id`.
-- Koneksi sistem (pemilik tabel) tidak terkena RLS; service layer tetap memeriksa izin.
create or replace function csse_current_user_id() returns uuid
language sql stable as $$ select nullif(current_setting('csse.user_id', true), '')::uuid $$;

alter table documents enable row level security;
create policy documents_select_visible on documents for select to csse_app_user
  using (csse_can_view_document(documents, csse_current_user_id()));
grant select on documents to csse_app_user;

alter table permissions enable row level security;
create policy permissions_select_own on permissions for select to csse_app_user
  using (
    exists (
      select 1 from users u where u.user_id = csse_current_user_id() and (
        u.role_id = 'OWNER'
        or (principal_type = 'USER' and principal_id = u.user_id::text)
        or (principal_type = 'ROLE' and principal_id = u.role_id)
        or (principal_type = 'DIVISION' and principal_id = u.division_id::text)
      )
    )
  );
grant select on permissions to csse_app_user;
grant execute on function csse_can_view_document(documents, uuid) to csse_app_user;
grant execute on function csse_current_user_id() to csse_app_user;

-- ── Supabase hardening: tabel CSSE tidak boleh terbaca lewat REST API (anon/authenticated) ─
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
      execute format('alter default privileges in schema public revoke all on functions from %I', r);
    end if;
  end loop;
end $$;
