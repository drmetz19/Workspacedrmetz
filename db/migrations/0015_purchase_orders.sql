-- Phase 22 — Surat Pesanan Barang (PSCM) + catatan barang masuk/keluar.
-- Cabang mengisi formulir TANPA login lewat link rahasia per cabang + PIN cabang, atau lewat aplikasi (login).
-- Tabel hanya diakses server CSSE (RLS aktif tanpa policy/grant untuk role lain).

create table branches (
  branch_id         uuid primary key default gen_random_uuid(),
  branch_name       text not null unique,
  branch_code       text not null unique check (branch_code ~ '^[A-Z0-9]{2,6}$'),
  -- bagian rahasia dari link formulir publik: /pesan/{public_token}
  public_token      text not null unique default replace(gen_random_uuid()::text, '-', ''),
  pin_hash          text,
  pin_failed_count  int not null default 0,
  pin_locked_until  timestamptz,
  status            text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
insert into branches (branch_name, branch_code) values ('Bhayangkara', 'BHY'), ('Cibadak', 'CBD');

create table purchase_orders (
  po_id             uuid primary key default gen_random_uuid(),
  po_number         text not null unique,
  branch_id         uuid not null references branches(branch_id),
  requester_name    text not null,
  requester_contact text,
  needed_date       date,
  notes             text,
  supplier_name     text,
  status            text not null default 'MENUNGGU'
                    check (status in ('MENUNGGU','DISETUJUI','DITOLAK','SEBAGIAN_DITERIMA','DITERIMA','DIBATALKAN')),
  source            text not null check (source in ('FORM_PUBLIK','APLIKASI')),
  created_by        uuid references users(user_id),
  decided_by        uuid references users(user_id),
  decided_at        timestamptz,
  decision_note     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index purchase_orders_branch_idx on purchase_orders(branch_id);
create index purchase_orders_status_idx on purchase_orders(status);
create index purchase_orders_created_idx on purchase_orders(created_at desc);

create table purchase_order_items (
  item_id    uuid primary key default gen_random_uuid(),
  po_id      uuid not null references purchase_orders(po_id) on delete cascade,
  line_no    int not null,
  item_name  text not null,
  qty        numeric(12,2) not null check (qty > 0),
  unit       text not null default 'pcs',
  note       text
);
create index purchase_order_items_po_idx on purchase_order_items(po_id);

create table goods_movements (
  movement_id       uuid primary key default gen_random_uuid(),
  po_id             uuid not null references purchase_orders(po_id) on delete cascade,
  item_id           uuid not null references purchase_order_items(item_id) on delete cascade,
  direction         text not null check (direction in ('MASUK','KELUAR')),
  qty               numeric(12,2) not null check (qty > 0),
  moved_on          date not null default current_date,
  recorded_by_name  text not null,
  recorded_by_user  uuid references users(user_id),
  source            text not null check (source in ('FORM_PUBLIK','APLIKASI')),
  note              text,
  created_at        timestamptz not null default now()
);
create index goods_movements_po_idx on goods_movements(po_id);
create index goods_movements_item_idx on goods_movements(item_id);

-- Nomor urut per cabang per tahun (SP/BHY/2026/0001).
create table po_counters (
  branch_id uuid not null references branches(branch_id),
  year      int  not null,
  last_seq  int  not null default 0,
  primary key (branch_id, year)
);

alter table branches enable row level security;
alter table purchase_orders enable row level security;
alter table purchase_order_items enable row level security;
alter table goods_movements enable row level security;
alter table po_counters enable row level security;
