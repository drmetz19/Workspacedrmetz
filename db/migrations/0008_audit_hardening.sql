-- Phase 12 — Audit: append-only untuk semua jalur, RLS untuk sesi user

-- Tolak TRUNCATE juga (UPDATE/DELETE sudah ditolak trigger baris sejak 0001).
create or replace function audit_events_no_truncate() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('csse.allow_audit_truncate', true), '') <> 'on' then
    raise exception 'audit_events bersifat append-only';
  end if;
  return null;
end $$;
create trigger audit_events_no_truncate before truncate on audit_events
  for each statement execute function audit_events_no_truncate();

revoke update, delete, truncate on audit_events from csse_app_user;
alter table audit_events enable row level security;
-- Sesi user: Owner melihat semua; user lain hanya event miliknya. Insert hanya atas nama dirinya sendiri.
create policy audit_select on audit_events for select to csse_app_user using (
  actor_user_id = csse_current_user_id()
  or exists (select 1 from users u where u.user_id = csse_current_user_id() and u.role_id = 'OWNER')
);
create policy audit_insert on audit_events for insert to csse_app_user with check (actor_user_id = csse_current_user_id());

create index audit_events_action_idx on audit_events(action, occurred_at desc);
