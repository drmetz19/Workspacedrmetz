-- Phase 21 — Divisi Supply Chain + kategori dokumen khas Supply Chain.
-- Kategori lain bisa ditambah fleksibel oleh pendaftar dokumen (lihat "Kategori baru" di form).

insert into divisions (division_name) values ('Supply Chain') on conflict (division_name) do nothing;

insert into categories (category_name) values
  ('Purchase Order'), ('Invoice Vendor'), ('Surat Jalan'), ('Kontrak Vendor'), ('Laporan Stok')
on conflict (category_name) do nothing;
