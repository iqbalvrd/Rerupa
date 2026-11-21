-- Fase 5 · Migrasi 13: progres tahap, hasil feedback checkpoint, event analitik (ERD §4.5, §4.6, §4.9)
-- Penyesuaian dari ERD v1.0:
--   * events.session_ref = bagian hex dari safety_id sesi (hash 32 hex), bukan ID mentah
--   * feedback_results.reasons menyimpan alasan foto ulang (kualitas/penyelarasan)
--   * feedback_results.summary + text_source: kalimat pembuka dan asal teks (ai/template)

create table stage_progress (
  session_id   uuid not null references practice_sessions(id) on delete cascade,
  stage_id     uuid not null references stages(id) on delete cascade,
  status       progress_status not null default 'viewed',
  viewed_at    timestamptz not null default now(),
  completed_at timestamptz,
  primary key (session_id, stage_id),
  -- "melihat ≠ menyelesaikan": completed_at hanya ada bila status completed
  constraint stage_progress_completed check ((status = 'completed') = (completed_at is not null))
);
create index stage_progress_stage_idx on stage_progress (stage_id);

create table feedback_results (
  job_id        uuid primary key references jobs(id) on delete cascade,
  session_id    uuid not null references practice_sessions(id) on delete cascade,
  stage_id      uuid not null references stages(id) on delete cascade,
  upload_id     uuid references uploads(id) on delete set null,
  image_quality text not null check (image_quality in ('usable', 'poor')),
  alignment     text not null check (alignment in ('confirmed', 'failed', 'not_checked')),
  alignment_method text,                                   -- grid | lines | null
  needs_retake  boolean not null,
  reasons       text[] not null default '{}',
  metrics       jsonb not null default '{}'::jsonb,
  candidates    jsonb not null default '[]'::jsonb,
  summary       text,
  suggestions   jsonb not null default '[]'::jsonb,       -- maks 2: [{region_code, observation, action, bbox?}]
  text_source   text check (text_source in ('ai', 'template')),
  created_at    timestamptz not null default now(),
  constraint feedback_max_two check (jsonb_array_length(suggestions) <= 2),
  constraint feedback_retake_no_suggestions check (not needs_retake or jsonb_array_length(suggestions) = 0)
);
create index feedback_results_session_idx on feedback_results (session_id, created_at desc);
create index feedback_results_stage_idx   on feedback_results (stage_id);
create index feedback_results_upload_idx  on feedback_results (upload_id);

create table events (
  id          bigint generated always as identity primary key,
  session_ref text check (session_ref is null or session_ref ~ '^[0-9a-f]{32}$'),
  name        text not null check (name in (
    'lesson_viewed', 'practice_started', 'stage_completed', 'recipe_opened', 'original_photo_opened',
    'checkpoint_requested', 'feedback_shown', 'lesson_completed', 'reflection_answered', 'session_deleted',
    'recognition_confirmed', 'story_opened'
  )),
  props       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index events_name_created_idx on events (name, created_at);

alter table stage_progress   enable row level security;
alter table feedback_results enable row level security;
alter table events           enable row level security;
