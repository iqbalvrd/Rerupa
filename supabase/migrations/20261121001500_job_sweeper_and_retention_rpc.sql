-- Migrasi 15: penyapu job di database (tidak bergantung pada worker) + RPC retensi lapisan
--
-- A1 (ANALISA_OPTIMASI.md): sebelumnya job yang lewat batas tunggu hanya digagalkan oleh loop worker.
-- Bila worker mati, job tetap 'queued' selamanya dan layar "Membuat tutorial" berputar terus.
-- Sekarang pg_cron menjalankan penyapu tiap 30 detik.
--
-- A5: pencarian lapisan tutorial yang filenya harus dihapus memakai filter `in.(…)` berisi semua
-- unggahan kedaluwarsa; dengan ribuan unggahan URL PostgREST terlalu panjang. Diganti fungsi SQL.

create or replace function fail_overdue_jobs(
  p_generate_seconds int default 60,
  p_feedback_seconds int default 45,
  p_grace_seconds    int default 15
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update jobs
     set status = 'failed', error_code = 'worker_timeout', finished_at = now(),
         progress = '{"step": "done"}'::jsonb, locked_by = null, locked_at = null
   where status in ('queued', 'processing')
     and created_at < now() - make_interval(secs =>
           case type when 'feedback' then p_feedback_seconds else p_generate_seconds end + p_grace_seconds);
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function sweep_jobs() returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_stale int;
  n_overdue int;
begin
  n_stale := requeue_stale_jobs(interval '2 minutes', 2);
  n_overdue := fail_overdue_jobs();
  return jsonb_build_object('requeued', n_stale, 'overdue', n_overdue);
end;
$$;

create or replace function expired_lesson_layers(p_limit int default 100)
returns table (id uuid, bucket text, asset_path text)
language sql
stable
security definer
set search_path = public
as $$
  select vl.id, vl.bucket, vl.asset_path
    from visual_layers vl
    join lesson_versions lv on lv.id = vl.lesson_version_id
    join uploads u on u.id = lv.source_upload_id
   where lv.origin = 'free_mode'
     and vl.purged_at is null
     and vl.bucket = 'derived'
     and vl.kind <> 'grid'
     and u.expires_at < now()
   limit p_limit;
$$;

revoke all on function fail_overdue_jobs(int, int, int) from public, anon, authenticated;
revoke all on function sweep_jobs() from public, anon, authenticated;
revoke all on function expired_lesson_layers(int) from public, anon, authenticated;
grant execute on function fail_overdue_jobs(int, int, int) to service_role;
grant execute on function sweep_jobs() to service_role;
grant execute on function expired_lesson_layers(int) to service_role;

select cron.schedule('rerupa-sweep-jobs', '30 seconds', $$select public.sweep_jobs()$$);
