-- Phase 20 — Akun divisi dengan password default
-- Owner membuat/mereset akun Division User dengan password berpola divisi (mis. Finance@DrMetz2026).
-- Karena polanya diketahui banyak orang, user wajib mengganti password sebelum bisa memakai aplikasi.
alter table users add column must_change_password boolean not null default false;
