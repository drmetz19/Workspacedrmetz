-- Phase 9 — Permintaan akses dokumen L3–5 (satu-satunya jenis approval di MVP)

create table access_requests (
  request_id         uuid primary key default gen_random_uuid(),
  document_id        uuid not null references documents(document_id),
  requester_user_id  uuid not null references users(user_id),
  requested_action   text not null default 'OPEN' check (requested_action in ('OPEN','EDIT_METADATA')),
  reason             text not null,
  approver_role      text not null check (approver_role in ('GM','OWNER')),
  status             text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','EXPIRED','CANCELLED')),
  auto_created       boolean not null default false,       -- dibuat otomatis (mis. GM pada dokumen wajib persetujuan Owner)
  duration_days      int check (duration_days in (1, 7, 30)),
  decided_by         uuid references users(user_id),
  decided_at         timestamptz,
  decision_note      text,
  permission_id      uuid references permissions(permission_id),
  expires_at         timestamptz,
  created_at         timestamptz not null default now()
);
create unique index access_requests_one_pending on access_requests(document_id, requester_user_id, requested_action) where status = 'PENDING';
create index access_requests_status_idx on access_requests(status, approver_role);
create index access_requests_requester_idx on access_requests(requester_user_id);

grant select on access_requests to csse_app_user;
