-- Fase 1 · Migrasi 3: fungsi atomik antrean job (dipanggil worker lewat RPC)

-- Klaim satu job queued tertua secara atomik. Aman dijalankan banyak worker sekaligus.
create or replace function claim_job(p_worker text, p_types job_type[] default null)
returns setof jobs
language sql
set search_path = public
as $$
  update jobs j
     set status     = 'processing',
         locked_by  = p_worker,
         locked_at  = now(),
         started_at = coalesce(j.started_at, now()),
         attempts   = j.attempts + 1,
         progress   = jsonb_build_object('step', 'started')
   where j.id = (
     select id from jobs
      where status = 'queued'
        and (p_types is null or type = any (p_types))
      order by created_at
      for update skip locked
      limit 1
   )
  returning j.*;
$$;

-- Kembalikan job processing yang lock-nya kedaluwarsa (worker mati) ke antrean,
-- atau gagalkan bila sudah mencoba p_max_attempts kali.
create or replace function requeue_stale_jobs(p_stale_after interval default interval '2 minutes', p_max_attempts int default 2)
returns int
language plpgsql
set search_path = public
as $$
declare
  n int;
begin
  with stale as (
    select id, attempts from jobs
     where status = 'processing'
       and locked_at < now() - p_stale_after
     for update skip locked
  )
  update jobs j
     set status      = case when s.attempts >= p_max_attempts then 'failed'::job_status else 'queued'::job_status end,
         error_code  = case when s.attempts >= p_max_attempts then 'worker_timeout' else j.error_code end,
         finished_at = case when s.attempts >= p_max_attempts then now() else null end,
         locked_by   = null,
         locked_at   = null
    from stale s
   where j.id = s.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Hanya backend (service_role) yang boleh memanggil fungsi ini.
revoke all on function claim_job(text, job_type[]) from public, anon, authenticated;
revoke all on function requeue_stale_jobs(interval, int) from public, anon, authenticated;
grant execute on function claim_job(text, job_type[]) to service_role;
grant execute on function requeue_stale_jobs(interval, int) to service_role;
