-- Fase 8 · Migrasi 16: storyline cerita (P1) untuk materi koleksi dan foto unggahan
-- RENCANA §4.8, PRD FR16 & §11.2. Sumber kisah berlapis → story_basis:
--   curated           : materi koleksi (klaim kurasi + basis budaya)
--   sourced           : identitas dikonfirmasi pengguna + sumber web tepercaya (URL disimpan)
--   user_hint         : berdasarkan isian pengguna, sumber tidak cukup
--   ai_interpretation : tanpa sumber → setiap panel berlabel "Interpretasi AI"

create table stories (
  id                uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references lesson_versions(id) on delete cascade,
  session_id        uuid references practice_sessions(id) on delete cascade,  -- null = cerita materi koleksi (dipakai bersama)
  job_id            uuid references jobs(id) on delete set null,
  story_basis       text not null check (story_basis in ('curated', 'sourced', 'user_hint', 'ai_interpretation')),
  status            text not null default 'generating' check (status in ('generating', 'ready', 'text_only', 'failed')),
  review_status     publish_status not null default 'draft',  -- cerita koleksi tampil ke pengguna hanya bila 'published'
  title             text,
  summary           text,
  identity          jsonb not null default '{}'::jsonb,   -- {title, artist, origin, confirmed_by_user}
  hints             jsonb not null default '{}'::jsonb,   -- isian pengguna (petunjuk, bukan fakta)
  claims            jsonb not null default '[]'::jsonb,   -- [{text, type, source_urls[], source_codes[]}]
  sources           jsonb not null default '[]'::jsonb,   -- [{url, title, domain}]
  characters        jsonb not null default '[]'::jsonb,   -- [{code, name, description, region_codes[]}]
  style_guide       text,
  text_model        text,
  image_model       text,
  error_code        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index stories_collection_idx on stories (lesson_version_id) where session_id is null;
create unique index stories_session_idx on stories (lesson_version_id, session_id) where session_id is not null;
create index stories_session_fk_idx on stories (session_id);
create index stories_job_idx on stories (job_id);
create trigger stories_updated_at before update on stories for each row execute function set_updated_at();

create table story_panels (
  id                 uuid primary key default gen_random_uuid(),
  story_id           uuid not null references stories(id) on delete cascade,
  order_no           smallint not null check (order_no between 1 and 6),
  narration          text not null,
  scene              text,
  kind               text not null check (kind in ('generated', 'artwork_crop', 'text')),
  status             text not null default 'pending' check (status in ('pending', 'ready', 'text_only')),
  bucket             text check (bucket in ('catalog', 'derived')),
  asset_path         text,
  purged_at          timestamptz,
  character_codes    text[] not null default '{}',
  focus_region_codes text[] not null default '{}',
  check_result       jsonb,
  created_at         timestamptz not null default now(),
  unique (story_id, order_no)
);

create table recognitions (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references practice_sessions(id) on delete cascade,
  upload_id            uuid references uploads(id) on delete set null,
  job_id               uuid references jobs(id) on delete set null,
  candidates           jsonb not null default '[]'::jsonb,  -- [{artwork_id, slug, title, score}]
  confirmed_artwork_id uuid references artworks(id) on delete set null,
  created_at           timestamptz not null default now()
);
create index recognitions_session_idx on recognitions (session_id);
create index recognitions_upload_idx on recognitions (upload_id);
create index recognitions_job_idx on recognitions (job_id);
create index recognitions_artwork_idx on recognitions (confirmed_artwork_id);

alter table jobs add constraint jobs_story_fk foreign key (story_id) references stories(id) on delete set null;
create index if not exists jobs_story_idx on jobs (story_id);

alter table stories      enable row level security;
alter table story_panels enable row level security;
alter table recognitions enable row level security;

-- Storyline butuh beberapa menit (4–6 panel gambar). Batas tunggu per jenis job.
create or replace function fail_overdue_jobs(
  p_generate_seconds int default 60,
  p_feedback_seconds int default 45,
  p_grace_seconds    int default 15,
  p_story_seconds    int default 300
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
           case type
             when 'feedback' then p_feedback_seconds
             when 'generate_story' then p_story_seconds
             when 'generate_panel' then p_story_seconds
             else p_generate_seconds
           end + p_grace_seconds);
  get diagnostics n = row_count;
  return n;
end;
$$;
drop function if exists fail_overdue_jobs(int, int, int);
revoke all on function fail_overdue_jobs(int, int, int, int) from public, anon, authenticated;
grant execute on function fail_overdue_jobs(int, int, int, int) to service_role;

-- Retensi (PRD §17, "panel cerita dari foto pengguna mengikuti retensi unggahan"): panel cerita
-- mode bebas dihapus bersama lapisan turunan foto setelah 24 jam; teks cerita tetap.
create or replace function expired_story_panels(p_limit int default 100)
returns table (id uuid, bucket text, asset_path text)
language sql
stable
security definer
set search_path = public
as $$
  select sp.id, sp.bucket, sp.asset_path
    from story_panels sp
    join stories s on s.id = sp.story_id
    join lesson_versions lv on lv.id = s.lesson_version_id
    join uploads u on u.id = lv.source_upload_id
   where s.session_id is not null
     and lv.origin = 'free_mode'
     and sp.purged_at is null
     and sp.asset_path is not null
     and sp.bucket = 'derived'
     and u.expires_at < now()
   limit p_limit;
$$;
revoke all on function expired_story_panels(int) from public, anon, authenticated;
grant execute on function expired_story_panels(int) to service_role;
