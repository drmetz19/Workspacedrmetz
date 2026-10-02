-- Phase 1 — Identitas, undangan, sesi, audit
-- Kompatibel dengan Postgres 16 lokal dan Postgres Supabase.

create extension if not exists pgcrypto;

-- Role aplikasi untuk query yang dijalankan atas nama user (dipakai RLS).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'csse_app_user') then
    create role csse_app_user nologin;
  end if;
end $$;
grant csse_app_user to current_user;
grant usage on schema public to csse_app_user;

-- ── Role ────────────────────────────────────────────────────────────────
create table roles (
  role_id    text primary key,           -- OWNER | GM | DIVISION_USER (extensible)
  role_name  text not null,
  role_level int  not null                -- makin tinggi makin luas
);
insert into roles (role_id, role_name, role_level) values
  ('OWNER', 'Owner / Super Admin', 100),
  ('GM', 'General Manager', 80),
  ('DIVISION_USER', 'Division User', 10);

-- ── Divisi ──────────────────────────────────────────────────────────────
create table divisions (
  division_id      uuid primary key default gen_random_uuid(),
  division_name    text not null unique,
  business_unit_id uuid,
  manager_user_id  uuid,
  status           text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
insert into divisions (division_name) values ('Legal/Perizinan');

-- ── User ────────────────────────────────────────────────────────────────
-- Undangan = baris user berstatus INVITED. Hanya email yang ada di tabel ini yang bisa masuk.
create table users (
  user_id             uuid primary key default gen_random_uuid(),
  drmetz_identity_id  text unique,                  -- disiapkan untuk DrMetz ID
  email               text not null unique check (email = lower(email)),
  name                text not null,
  role_id             text not null references roles(role_id),
  division_id         uuid references divisions(division_id),
  status              text not null default 'INVITED' check (status in ('INVITED','ACTIVE','DEACTIVATED')),
  failed_login_count  int  not null default 0,
  locked_until        timestamptz,
  last_login_at       timestamptz,
  invited_by          uuid references users(user_id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table divisions add constraint divisions_manager_fk foreign key (manager_user_id) references users(user_id);

-- ── Sesi CSSE (independen dari identity provider) ───────────────────────
create table sessions (
  session_hash  text primary key,                   -- sha256 dari token cookie
  user_id       uuid not null references users(user_id),
  login_method  text not null check (login_method in ('GOOGLE','PASSWORD')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz
);
create index sessions_user_idx on sessions(user_id);

-- ── Token sekali pakai (undangan set-password & reset password) ─────────
create table auth_tokens (
  token_hash  text primary key,
  user_id     uuid not null references users(user_id),
  purpose     text not null check (purpose in ('INVITE','RESET_PASSWORD')),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ── Identity provider lokal (khusus pengembangan; tidak dipakai bila IDENTITY_PROVIDER=supabase)
create table local_identities (
  email          text primary key check (email = lower(email)),
  password_hash  text not null,
  updated_at     timestamptz not null default now()
);

-- ── Outbox email (adapter email "outbox") ───────────────────────────────
create table email_outbox (
  email_id    uuid primary key default gen_random_uuid(),
  to_email    text not null,
  subject     text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- ── Audit (append-only) ─────────────────────────────────────────────────
create table audit_events (
  event_id       uuid primary key default gen_random_uuid(),
  actor_user_id  uuid references users(user_id),
  actor_email    text,
  action         text not null,
  resource_type  text,
  resource_id    text,
  occurred_at    timestamptz not null default now(),
  result         text not null,           -- SUCCESS | DENIED | FAILED | REJECTED | ...
  source         text not null default 'UI' check (source in ('UI','API','AI','SYSTEM')),
  metadata       jsonb not null default '{}'::jsonb
);
create index audit_events_time_idx on audit_events(occurred_at desc);
create index audit_events_actor_idx on audit_events(actor_user_id);
create index audit_events_resource_idx on audit_events(resource_type, resource_id);

create or replace function audit_events_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_events bersifat append-only';
end $$;
create trigger audit_events_no_update before update or delete on audit_events
  for each row execute function audit_events_immutable();

grant insert, select on audit_events to csse_app_user;
grant select on roles, divisions, users to csse_app_user;
