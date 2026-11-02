-- Phase 23 — Token AI agent untuk server MCP (baca saja).
-- Token terikat ke satu user: agent hanya bisa melihat yang boleh dilihat user itu (permission engine yang sama).
-- Yang disimpan hanya hash SHA-256; token polos hanya tampil sekali saat dibuat.

create table agent_tokens (
  token_id      uuid primary key default gen_random_uuid(),
  name          text not null,
  user_id       uuid not null references users(user_id),
  token_hash    text not null unique,
  token_prefix  text not null,
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  created_by    uuid references users(user_id),
  created_at    timestamptz not null default now()
);
create index agent_tokens_user_idx on agent_tokens(user_id);

alter table agent_tokens enable row level security;
