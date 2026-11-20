-- Fase 1 · Migrasi 7: parameter per job (mis. persetujuan kirim foto ke AI saat job dibuat)

alter table jobs add column params jsonb not null default '{}'::jsonb;
