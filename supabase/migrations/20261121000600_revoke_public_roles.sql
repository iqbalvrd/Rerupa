-- Fase 1 · Migrasi 6: cabut hak bawaan anon/authenticated di schema public
-- Supabase memberi REFERENCES, TRIGGER, TRUNCATE secara bawaan. TRUNCATE tidak dibatasi RLS,
-- jadi dicabut sebagai pertahanan berlapis. Frontend tidak pernah mengakses DB langsung.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
