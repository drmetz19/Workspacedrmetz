-- Hardening akhir (terutama untuk Supabase): semua tabel CSSE tertutup untuk REST API (anon/authenticated).
-- 1) RLS aktif di SEMUA tabel public (tanpa policy = tolak semua untuk role non-bypass).
--    App terhubung sebagai pemilik/role bypass untuk kerja sistem, dan memakai csse_app_user (dengan policy) untuk query atas nama user.
-- 2) Cabut ulang hak anon/authenticated (termasuk tabel yang dibuat setelah 0004).
do $$
declare t record; r text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
    end if;
  end loop;
end $$;

-- Tabel yang perlu dibaca role sesi user (csse_app_user) mendapat policy baca eksplisit.
create policy roles_read on roles for select to csse_app_user using (true);
create policy divisions_read on divisions for select to csse_app_user using (true);
create policy categories_read on categories for select to csse_app_user using (true);
create policy users_read on users for select to csse_app_user using (true);
create policy access_requests_read on access_requests for select to csse_app_user using (
  requester_user_id = csse_current_user_id()
  or exists (select 1 from users u where u.user_id = csse_current_user_id() and u.role_id in ('OWNER','GM'))
);
create policy drive_sources_read on drive_sources for select to csse_app_user using (
  exists (select 1 from users u where u.user_id = csse_current_user_id() and u.role_id in ('OWNER','GM'))
);
create policy document_suggestions_read on document_suggestions for select to csse_app_user using (
  exists (select 1 from documents d where d.document_id = document_suggestions.document_id)
);
