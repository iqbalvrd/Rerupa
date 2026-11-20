-- Fase 1 · Migrasi 1: enum dan tabel konten (ERD §3, §4.1–4.3)

-- ============ Enum ============
create type publish_status   as enum ('draft', 'in_review', 'published', 'archived');
create type lesson_origin    as enum ('collection', 'free_mode');
create type lesson_status    as enum ('draft', 'in_review', 'published', 'archived', 'session_private');
create type license_kind     as enum ('public_domain', 'cc0', 'cc_by', 'cc_by_sa', 'open_data', 'ebt_pending', 'own_work', 'permission_granted', 'unknown');
create type culture_kind     as enum ('tradition', 'motif', 'technique', 'story', 'character');
create type claim_type       as enum ('fakta', 'perkiraan');
create type layer_kind       as enum ('grid', 'lineart', 'main_object', 'regions', 'value', 'detail_lines', 'original_photo');
create type lineart_method   as enum ('model', 'teed', 'xdog', 'canny');
create type stage_kind       as enum ('preparation', 'sketch', 'background_and_largest', 'main_object', 'medium_regions', 'value', 'small_and_detail', 'finishing');
create type recipe_kind      as enum ('estimated', 'tested');
create type progress_status  as enum ('not_started', 'viewed', 'completed');
create type upload_purpose   as enum ('reference', 'progress');
create type job_type         as enum ('generate_lesson', 'feedback', 'recognize', 'generate_story', 'generate_panel');
create type job_status       as enum ('queued', 'processing', 'succeeded', 'needs_retake', 'failed');
create type review_kind      as enum ('rights', 'culture', 'pedagogy', 'recipe', 'panel');
create type review_decision  as enum ('approved', 'changes_requested', 'rejected');
create type ai_provider      as enum ('openai', 'deepseek');

-- ============ Utilitas ============
create or replace function set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============ Sumber & budaya ============
create table sources (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  title       text not null,
  publisher   text,
  url         text,
  note        text,
  license     license_kind not null default 'unknown',
  accessed_at date not null default current_date,
  created_at  timestamptz not null default now()
);

create table culture_entries (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,
  kind                  culture_kind not null,
  name                  text not null,
  summary               text not null,
  attributes            jsonb not null default '{}'::jsonb,
  generation_restricted boolean not null default false,
  status                publish_status not null default 'draft',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger culture_entries_updated_at before update on culture_entries
  for each row execute function set_updated_at();

create table culture_entry_sources (
  culture_entry_id uuid not null references culture_entries(id) on delete cascade,
  source_id        uuid not null references sources(id) on delete restrict,
  primary key (culture_entry_id, source_id)
);

create table content_reviews (
  id           uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('artwork', 'lesson_version', 'color_recipe', 'story_panel', 'culture_entry')),
  subject_id   uuid not null,
  kind         review_kind not null,
  reviewer     text not null,
  decision     review_decision not null,
  notes        text,
  reviewed_at  timestamptz not null default now()
);
create index content_reviews_subject_idx on content_reviews (subject_type, subject_id);

-- ============ Katalog karya ============
create table artworks (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  title               text not null,
  artist              text,              -- null = tidak diketahui; tidak boleh ditebak
  artist_death_year   int,
  tradition           text,
  region_origin       text,
  image_path          text not null,     -- bucket catalog
  thumbnail_path      text not null,
  license             license_kind not null default 'unknown',
  license_note        text,
  rights_evidence_url text,
  adaptation_scope    text,
  status              publish_status not null default 'draft',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint artworks_publish_needs_license check (status <> 'published' or license <> 'unknown')
);
create trigger artworks_updated_at before update on artworks
  for each row execute function set_updated_at();
create index artworks_status_idx on artworks (status);

create table artwork_sources (
  artwork_id uuid not null references artworks(id) on delete cascade,
  source_id  uuid not null references sources(id) on delete restrict,
  claim_note text,
  primary key (artwork_id, source_id)
);

-- ============ Palet & warna ============
create table palettes (
  id         uuid primary key default gen_random_uuid(),
  brand      text not null,
  series     text not null,
  name       text not null,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now()
);

create table paints (
  id           uuid primary key default gen_random_uuid(),
  palette_id   uuid not null references palettes(id) on delete cascade,
  code         text not null,
  name         text not null,
  pigment_code text,
  hex          char(7) not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  lab          numeric[] not null check (array_length(lab, 1) = 3),
  swatch_path  text,
  measured_at  date,
  unique (palette_id, code)
);

create table color_recipes (
  id              uuid primary key default gen_random_uuid(),
  palette_id      uuid not null references palettes(id) on delete cascade,
  target_hex      char(7) not null check (target_hex ~ '^#[0-9A-Fa-f]{6}$'),
  target_lab      numeric[] not null check (array_length(target_lab, 1) = 3),
  components      jsonb not null,        -- [{paint_id, parts}]
  delta_e         numeric(5,2) not null,
  kind            recipe_kind not null,
  method          text not null,         -- mixbox_v2 | physical
  correction_tips jsonb,
  swatch_path     text,
  tested_at       date,
  tested_by       text,
  created_at      timestamptz not null default now(),
  constraint color_recipes_tested_complete check (
    kind <> 'tested' or (swatch_path is not null and tested_at is not null and tested_by is not null)
  )
);
create index color_recipes_palette_idx on color_recipes (palette_id);
