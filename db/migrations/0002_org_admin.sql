-- Phase 2 — Administrasi organisasi: kategori dokumen

create table categories (
  category_id    uuid primary key default gen_random_uuid(),
  category_name  text not null unique,
  status         text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
insert into categories (category_name) values
  ('Izin Operasional'), ('SIP'), ('STR'), ('Kontrak'), ('MoU'), ('Sewa'), ('Sertifikat'), ('Lainnya');

grant select on categories to csse_app_user;
