-- Phase 17 — Notulensi Rapat & Tindak Lanjut
-- Tambahan di luar PRD pilot (permintaan Owner): pencatatan notulensi rapat per divisi +
-- daftar tindak lanjut (to-do) dengan status & PIC, terpisah dari registry dokumen L1-5.

create table meeting_minutes (
  minutes_id     uuid primary key default gen_random_uuid(),
  division_id    uuid not null references divisions(division_id),
  title          text not null,
  meeting_date   date not null,
  meeting_type   text not null default 'INTERNAL' check (meeting_type in ('INTERNAL','EKSTERNAL')),
  attendees      text[] not null default '{}',
  summary        text not null,
  drive_url      text,
  status         text not null default 'DISAHKAN' check (status in ('DRAFT','DISAHKAN')),
  pic_user_id    uuid references users(user_id),
  created_by     uuid references users(user_id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index meeting_minutes_division_idx on meeting_minutes(division_id);
create index meeting_minutes_date_idx on meeting_minutes(meeting_date desc);

create table meeting_action_items (
  action_item_id uuid primary key default gen_random_uuid(),
  minutes_id     uuid references meeting_minutes(minutes_id) on delete cascade,
  division_id    uuid not null references divisions(division_id),
  description    text not null,
  pic_user_id    uuid references users(user_id),
  due_date       date,
  status         text not null default 'BELUM_MULAI' check (status in ('BELUM_MULAI','BERJALAN','SELESAI')),
  completed_at   timestamptz,
  created_by     uuid references users(user_id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index meeting_action_items_minutes_idx on meeting_action_items(minutes_id);
create index meeting_action_items_division_idx on meeting_action_items(division_id);
create index meeting_action_items_pic_idx on meeting_action_items(pic_user_id);
create index meeting_action_items_status_idx on meeting_action_items(status);
create index meeting_action_items_due_idx on meeting_action_items(due_date) where due_date is not null;

-- RLS: migrasi 0009 mengaktifkan RLS untuk tabel yang SUDAH ADA saat itu; tabel baru perlu diaktifkan eksplisit.
alter table meeting_minutes enable row level security;
alter table meeting_action_items enable row level security;

-- Boleh tahu: Owner & GM semua divisi; Division User hanya divisinya sendiri (sejalan dengan scoping dokumen).
create policy meeting_minutes_select on meeting_minutes for select to csse_app_user using (
  exists (select 1 from users u where u.user_id = csse_current_user_id() and (u.role_id in ('OWNER','GM') or u.division_id = meeting_minutes.division_id))
);
create policy meeting_action_items_select on meeting_action_items for select to csse_app_user using (
  exists (select 1 from users u where u.user_id = csse_current_user_id() and (u.role_id in ('OWNER','GM') or u.division_id = meeting_action_items.division_id))
);
grant select on meeting_minutes, meeting_action_items to csse_app_user;
