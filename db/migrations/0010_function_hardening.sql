-- Hardening fungsi (temuan Supabase security advisor):
-- search_path tetap, dan fungsi CSSE tidak bisa dipanggil lewat REST RPC (EXECUTE default PUBLIC dicabut).
alter function csse_current_user_id() set search_path = public;
alter function audit_events_immutable() set search_path = public;
alter function audit_events_no_truncate() set search_path = public;
revoke execute on function csse_can_view_document(documents, uuid) from public;
revoke execute on function csse_current_user_id() from public;
grant execute on function csse_can_view_document(documents, uuid) to csse_app_user;
grant execute on function csse_current_user_id() to csse_app_user;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function csse_can_view_document(documents, uuid) from %I', r);
      execute format('revoke execute on function csse_current_user_id() from %I', r);
    end if;
  end loop;
end $$;
