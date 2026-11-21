-- Fase 3 · Migrasi 10: tabel tutorial (ERD §4.4) + FK yang ditunda dari Fase 1
-- Penyesuaian dari ERD v1.0:
--   * layer_kind ditambah 'sketch' (garis bentuk besar untuk tahap sketsa)
--   * visual_layers menyimpan bucket (catalog untuk koleksi, derived untuk mode bebas)
--   * regions tidak menyimpan path SVG per region; bentuk ada di layer regions.svg (id = kode region)

alter type layer_kind add value if not exists 'sketch';

create table lesson_versions (
  id                uuid primary key default gen_random_uuid(),
  artwork_id        uuid references artworks(id) on delete cascade,
  origin            lesson_origin not null,
  owner_session_id  uuid references practice_sessions(id) on delete cascade,
  version           int not null default 1,
  source_upload_id  uuid references uploads(id) on delete set null,
  medium            text not null default 'acrylic',
  level             text not null default 'beginner',
  scope             jsonb,
  image_width       int not null check (image_width > 0),
  image_height      int not null check (image_height > 0),
  use_shading       boolean not null,
  style             jsonb not null default '{}'::jsonb,
  lineart_method    lineart_method not null,
  skill_goal        text,
  culture_goal      text,
  checkpoint_count  smallint not null check (checkpoint_count in (1, 2)),
  ai_text_status    text not null check (ai_text_status in ('ai', 'template', 'curated')),
  prompt_version    text,
  status            lesson_status not null,
  reviewer          text,
  created_at        timestamptz not null default now(),
  constraint lesson_free_mode_private check (
    origin <> 'free_mode' or (owner_session_id is not null and status = 'session_private')
  ),
  constraint lesson_collection_has_artwork check (origin <> 'collection' or artwork_id is not null)
);
create unique index lesson_versions_artwork_version_idx on lesson_versions (artwork_id, version) where artwork_id is not null;
create index lesson_versions_owner_idx on lesson_versions (owner_session_id);
create index lesson_versions_upload_idx on lesson_versions (source_upload_id);

create table regions (
  id                uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references lesson_versions(id) on delete cascade,
  code              text not null check (code ~ '^r[0-9]{2,3}$'),
  hex               char(7) not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  lab               numeric[] not null check (array_length(lab, 1) = 3),
  area_pct          numeric(6,3) not null,
  bbox              int[] not null check (array_length(bbox, 1) = 4),
  centroid          int[] not null check (array_length(centroid, 1) = 2),
  is_main_object    boolean not null,
  is_background     boolean not null,
  value_level       smallint,
  neighbors         text[] not null default '{}',
  label             text,
  unique (lesson_version_id, code)
);

create table visual_layers (
  id                uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references lesson_versions(id) on delete cascade,
  kind              layer_kind not null,
  bucket            text not null check (bucket in ('catalog', 'derived')),
  asset_path        text not null,
  format            text not null check (format in ('svg', 'png', 'jpeg')),
  meta              jsonb not null default '{}'::jsonb,
  unique (lesson_version_id, kind)
);

create table stages (
  id                uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references lesson_versions(id) on delete cascade,
  code              text not null,
  order_no          smallint not null check (order_no between 1 and 8),
  kind              stage_kind not null,
  layers            text[] not null,
  is_checkpoint     boolean not null default false,
  title             text not null,
  action            text not null,
  tools             text[] not null default '{}',
  done_when         text not null,
  common_mistakes   text[] not null default '{}',
  focus_bbox        int[] check (focus_bbox is null or array_length(focus_bbox, 1) = 4),
  text_source       text not null check (text_source in ('ai', 'template', 'curated')),
  unique (lesson_version_id, code),
  unique (lesson_version_id, order_no)
);

-- Region yang PERTAMA KALI dibuka di tahap tersebut; tiap region tepat sekali (tahapan kumulatif).
create table stage_regions (
  stage_id  uuid not null references stages(id) on delete cascade,
  region_id uuid not null references regions(id) on delete cascade,
  primary key (stage_id, region_id),
  unique (region_id)
);

create table region_colors (
  region_id    uuid not null references regions(id) on delete cascade,
  palette_id   uuid not null references palettes(id) on delete cascade,
  recipe_id    uuid references color_recipes(id) on delete set null,
  estimate     jsonb,
  reachability text not null check (reachability in ('recipe', 'estimate', 'hard')),
  explanation  text,
  primary key (region_id, palette_id),
  constraint region_colors_has_value check (recipe_id is not null or estimate is not null)
);

create table culture_claims (
  id                uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references lesson_versions(id) on delete cascade,
  stage_id          uuid references stages(id) on delete set null,
  text              text not null,
  type              claim_type not null,
  order_no          smallint not null default 0
);

create table culture_claim_sources (
  claim_id  uuid not null references culture_claims(id) on delete cascade,
  source_id uuid not null references sources(id) on delete restrict,
  primary key (claim_id, source_id)
);

create table reflection_questions (
  id                uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null unique references lesson_versions(id) on delete cascade,
  question          text not null,
  options           jsonb not null,
  correct_option    smallint not null,
  answer_source_id  uuid not null references sources(id) on delete restrict
);

-- Indeks foreign key
create index regions_lesson_idx            on regions (lesson_version_id);
create index stages_lesson_idx             on stages (lesson_version_id);
create index stage_regions_region_idx      on stage_regions (region_id);
create index region_colors_palette_idx     on region_colors (palette_id);
create index region_colors_recipe_idx      on region_colors (recipe_id);
create index culture_claims_lesson_idx     on culture_claims (lesson_version_id);
create index culture_claims_stage_idx      on culture_claims (stage_id);
create index culture_claim_sources_src_idx on culture_claim_sources (source_id);
create index reflection_answer_src_idx     on reflection_questions (answer_source_id);

-- FK yang ditunda sejak Fase 1
alter table practice_sessions add constraint practice_sessions_lesson_fk
  foreign key (lesson_version_id) references lesson_versions(id) on delete set null;
alter table uploads add constraint uploads_stage_fk
  foreign key (stage_id) references stages(id) on delete set null;
alter table jobs add constraint jobs_stage_fk
  foreign key (stage_id) references stages(id) on delete set null;
alter table jobs add constraint jobs_lesson_fk
  foreign key (lesson_version_id) references lesson_versions(id) on delete set null;
create index practice_sessions_lesson_idx on practice_sessions (lesson_version_id);
create index uploads_stage_idx            on uploads (stage_id);
create index jobs_stage_idx               on jobs (stage_id);
create index jobs_lesson_idx              on jobs (lesson_version_id);

-- Kunci akses: sama seperti Fase 1 (hanya service_role)
alter table lesson_versions       enable row level security;
alter table regions               enable row level security;
alter table visual_layers         enable row level security;
alter table stages                enable row level security;
alter table stage_regions         enable row level security;
alter table region_colors         enable row level security;
alter table culture_claims        enable row level security;
alter table culture_claim_sources enable row level security;
alter table reflection_questions  enable row level security;
