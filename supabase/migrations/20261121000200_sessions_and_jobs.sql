-- Fase 1 · Migrasi 2: sesi tamu, unggahan, antrean job, pemakaian AI (ERD §4.5–4.6)
-- Catatan penyesuaian dari ERD v1.0:
--   * hash disimpan sebagai text hex (bukan bytea) agar mudah dibaca lewat PostgREST/supabase-py
--   * practice_sessions.palette_id boleh null (palet dipilih di layar Persiapan, setelah sesi dibuat)
--   * FK ke lesson_versions / stages ditambahkan di migrasi Fase 3, saat tabelnya dibuat

create table practice_sessions (
  id                  uuid primary key default gen_random_uuid(),
  token_hash          text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  lesson_version_id   uuid,                                   -- FK di Fase 3
  palette_id          uuid references palettes(id) on delete set null,
  canvas_size         text check (canvas_size in ('A4', 'A3', '30x40')),
  current_stage_order smallint not null default 1 check (current_stage_order between 1 and 8),
  consent             jsonb not null default '{}'::jsonb,     -- {ai_photo, at, text_version}
  safety_id           text not null,                          -- hash untuk safety_identifier OpenAI
  created_at          timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  expires_at          timestamptz not null default now() + interval '7 days',
  deleted_at          timestamptz
);
create index practice_sessions_expires_idx on practice_sessions (expires_at);
create index practice_sessions_deleted_idx on practice_sessions (deleted_at) where deleted_at is not null;

create table uploads (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references practice_sessions(id) on delete cascade,
  purpose         upload_purpose not null,
  stage_id        uuid,                                       -- FK di Fase 3; wajib bila progress (dicek aplikasi)
  raw_path        text,                                       -- gambar bersih tanpa EXIF, resolusi asli; null setelah dihapus
  normalized_path text,
  rectified_path  text,
  corners         int[] check (corners is null or array_length(corners, 1) = 8),
  sha256          text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  mime            text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  width           int not null check (width > 0),
  height          int not null check (height > 0),
  quality         jsonb,
  sent_to_ai      boolean not null default false,
  expires_at      timestamptz not null default now() + interval '24 hours',
  purged_at       timestamptz,
  created_at      timestamptz not null default now()
);
create index uploads_session_idx on uploads (session_id);
create index uploads_expires_idx on uploads (expires_at) where purged_at is null;
create index uploads_sha256_idx on uploads (sha256);

create table jobs (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references practice_sessions(id) on delete cascade,
  type              job_type not null,
  idempotency_key   text not null check (length(idempotency_key) between 8 and 128),
  payload_hash      text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status            job_status not null default 'queued',
  upload_id         uuid references uploads(id) on delete set null,
  stage_id          uuid,                                     -- FK di Fase 3
  lesson_version_id uuid,                                     -- FK di Fase 3
  story_id          uuid,                                     -- P1
  progress          jsonb not null default '{"step": "queued"}'::jsonb,
  result            jsonb,                                    -- ringkasan kecil untuk GET /jobs/:id
  attempts          smallint not null default 0,
  error_code        text,
  locked_by         text,
  locked_at         timestamptz,
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz not null default now(),
  unique (session_id, type, idempotency_key)
);
create index jobs_queue_idx on jobs (created_at) where status = 'queued';
create index jobs_processing_idx on jobs (locked_at) where status = 'processing';
create index jobs_session_idx on jobs (session_id, type);

create table ai_usage (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid references jobs(id) on delete set null,
  provider      ai_provider not null,
  model         text not null,
  task          text not null,
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  cached_tokens int not null default 0,
  image_count   int not null default 0,
  cost_usd      numeric(10,5) not null default 0,
  latency_ms    int,
  outcome       text not null check (outcome in ('ok', 'retry', 'refusal', 'truncated', 'schema_error', 'timeout', 'error')),
  created_at    timestamptz not null default now()
);
create index ai_usage_created_idx on ai_usage (created_at);
