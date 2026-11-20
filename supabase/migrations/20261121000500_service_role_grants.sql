-- Fase 1 · Migrasi 5: hak akses tabel untuk service_role (backend FastAPI)
-- Project Supabase baru tidak otomatis memberi hak tabel di schema public.
-- Hanya service_role yang diberi akses; anon dan authenticated tetap tanpa hak.

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Tabel yang dibuat di migrasi berikutnya ikut mendapat hak yang sama.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
