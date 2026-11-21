-- Fase 7 · Migrasi 14: retensi (PRD §17, ERD §6)
-- Pembagian kerja:
--   * pg_cron (tiap 15 menit): data yang hanya ada di database — events > 180 hari, ai_usage > 90 hari.
--   * worker (services/retention.py, tiap 15 menit): semua yang menyangkut file Storage — foto unggahan
--     > 24 jam, lapisan tutorial mode bebas turunan foto > 24 jam, lalu baris sesi terhapus/kedaluwarsa.
--     File harus dihapus lewat Storage API (bukan SQL), dan baris sesi baru dihapus SETELAH filenya,
--     agar path file tidak hilang sebelum objeknya dibersihkan.

-- Penanda lapisan yang filenya sudah dihapus (FR13: diganti penanda, teks tetap ada)
alter table visual_layers add column purged_at timestamptz;

create index if not exists practice_sessions_cleanup_idx on practice_sessions (expires_at) where deleted_at is null;
create index if not exists lesson_versions_free_mode_idx on lesson_versions (source_upload_id) where origin = 'free_mode';
create index if not exists events_created_idx on events (created_at);

create or replace function retention_db() returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_events int;
  n_usage int;
begin
  delete from events where created_at < now() - interval '180 days';
  get diagnostics n_events = row_count;
  delete from ai_usage where created_at < now() - interval '90 days';
  get diagnostics n_usage = row_count;
  return jsonb_build_object('events', n_events, 'ai_usage', n_usage);
end;
$$;

revoke all on function retention_db() from public, anon, authenticated;
grant execute on function retention_db() to service_role;

create extension if not exists pg_cron;

select cron.schedule('rerupa-retention-db', '*/15 * * * *', $$select public.retention_db()$$);
