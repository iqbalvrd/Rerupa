-- Fase 1 · Migrasi 8: job milik sesi yang dihapus/kedaluwarsa tidak boleh diproses
-- Alasan privasi: setelah pengguna menghapus sesi, fotonya tidak boleh lagi diproses atau dikirim ke AI.
-- p_session_id opsional: membatasi klaim ke satu sesi (dipakai tes integrasi agar tidak menyentuh job lain).

drop function if exists claim_job(text, job_type[]);

create or replace function claim_job(p_worker text, p_types job_type[] default null, p_session_id uuid default null)
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
     select q.id
       from jobs q
       join practice_sessions s on s.id = q.session_id
      where q.status = 'queued'
        and s.deleted_at is null
        and s.expires_at > now()
        and (p_types is null or q.type = any (p_types))
        and (p_session_id is null or q.session_id = p_session_id)
      order by q.created_at
      for update of q skip locked
      limit 1
   )
  returning j.*;
$$;

revoke all on function claim_job(text, job_type[], uuid) from public, anon, authenticated;
grant execute on function claim_job(text, job_type[], uuid) to service_role;

-- Batalkan job antre yang tertinggal dari sesi yang sudah dihapus/kedaluwarsa.
update jobs j
   set status = 'failed', error_code = 'session_deleted', finished_at = now(), progress = '{"step": "done"}'::jsonb
  from practice_sessions s
 where s.id = j.session_id
   and j.status = 'queued'
   and (s.deleted_at is not null or s.expires_at <= now());
