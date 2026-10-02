-- Phase 3 — Document registry + versi

create table documents (
  document_id              uuid primary key default gen_random_uuid(),
  external_provider        text not null default 'GOOGLE_DRIVE' check (external_provider in ('GOOGLE_DRIVE')),
  external_resource_id     text,                         -- Drive file ID (bukan URL) — identitas eksternal
  external_url             text,
  document_name            text not null,
  document_number          text,
  category_id              uuid references categories(category_id),
  division_id              uuid references divisions(division_id),
  business_unit_id         uuid,
  security_level           smallint not null default 2 check (security_level between 1 and 5),
  owner_user_id            uuid references users(user_id),
  pic_user_id              uuid references users(user_id),
  status                   text not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','SUPERSEDED','ARCHIVED')),
  version                  int  not null default 1 check (version >= 1),
  supersedes_document_id   uuid references documents(document_id),
  effective_date           date,
  expiry_date              date,
  confirmed_summary        text,
  owner_approval_required  boolean not null default false,
  source_id                uuid,
  flag_source_missing      boolean not null default false,
  flag_content_unreadable  boolean not null default false,
  created_by               uuid references users(user_id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint documents_dates_chk check (expiry_date is null or effective_date is null or expiry_date >= effective_date),
  constraint documents_not_self_supersede check (supersedes_document_id is null or supersedes_document_id <> document_id)
);

create unique index documents_external_uq on documents(external_provider, external_resource_id) where external_resource_id is not null;
create unique index documents_supersedes_uq on documents(supersedes_document_id) where supersedes_document_id is not null;
create index documents_status_idx on documents(status);
create index documents_division_idx on documents(division_id);
create index documents_pic_idx on documents(pic_user_id);
create index documents_expiry_idx on documents(expiry_date) where expiry_date is not null;
