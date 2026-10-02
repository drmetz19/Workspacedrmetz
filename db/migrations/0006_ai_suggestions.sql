-- Phase 7 — AI saran metadata
-- Flag untuk adapter mock (pengembangan/smoke test), mis. memaksa provider AI gagal.
create table dev_flags (
  key    text primary key,
  value  text not null
);
