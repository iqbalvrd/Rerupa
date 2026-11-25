-- Tutorial bertahap (structure_version 2): 3 fase, 14–20 langkah, titik patokan, 3 tingkat garis, maks 6 campuran.
-- Rencana: docs/RENCANA_TUTORIAL_BERTAHAP.md; kontrak: api/API.md "Tutorial bertahap", api/examples/lesson_detail_v2.json.
-- Lesson lama tetap structure_version 1 (8 tahap) dan tetap terbaca.

-- 1. Jenis tahap dan lapisan baru
alter type stage_kind add value if not exists 'grid';
alter type stage_kind add value if not exists 'landmarks';
alter type stage_kind add value if not exists 'block_in';
alter type stage_kind add value if not exists 'background_lines';
alter type stage_kind add value if not exists 'contour';
alter type stage_kind add value if not exists 'sketch_check';
alter type stage_kind add value if not exists 'color_prep';
alter type stage_kind add value if not exists 'paint_mix';
alter type stage_kind add value if not exists 'accents';
alter type stage_kind add value if not exists 'compare';

alter type layer_kind add value if not exists 'landmarks';
alter type layer_kind add value if not exists 'block_in';
alter type layer_kind add value if not exists 'background_lines';

-- 2. Batas jumlah langkah 8 → 20
alter table stages drop constraint if exists stages_order_no_check;
alter table stages add constraint stages_order_no_check check (order_no between 1 and 20);
alter table practice_sessions drop constraint if exists practice_sessions_current_stage_order_check;
alter table practice_sessions add constraint practice_sessions_current_stage_order_check check (current_stage_order between 1 and 20);

-- 3. Kolom baru
alter table lesson_versions
  add column if not exists structure_version smallint not null default 1 check (structure_version in (1, 2)),
  add column if not exists landmarks jsonb not null default '[]'::jsonb;  -- [{no, x, y, grid_cell, kind, label}]

alter table stages
  add column if not exists phase      text check (phase is null or phase in ('sketch', 'color', 'finishing')),
  add column if not exists new_lines  text,                       -- layer_kind yang garisnya baru di langkah ini
  add column if not exists grid_cells text[] not null default '{}',
  add column if not exists mix_id     text;

alter table regions
  add column if not exists mix_id     text,
  add column if not exists grid_cells text[] not null default '{}';

-- 4. Campuran (maks 6 per lesson; warna target tidak bergantung palet, resep per palet)
create table if not exists lesson_mixes (
  lesson_version_id  uuid not null references lesson_versions(id) on delete cascade,
  mix_id             text not null,
  order_no           smallint not null check (order_no between 1 and 6),
  name               text,
  target_hex         char(7) not null check (target_hex ~ '^#[0-9A-Fa-f]{6}$'),
  target_lab         numeric[] not null check (array_length(target_lab, 1) = 3),
  max_region_delta_e numeric(5,2),
  primary key (lesson_version_id, mix_id),
  unique (lesson_version_id, order_no)
);

create table if not exists mix_colors (
  lesson_version_id uuid not null,
  mix_id            text not null,
  palette_id        uuid not null references palettes(id) on delete cascade,
  recipe_id         uuid references color_recipes(id) on delete set null,
  estimate          jsonb,
  reachability      text not null check (reachability in ('recipe', 'estimate', 'hard')),
  explanation       text,
  primary key (lesson_version_id, mix_id, palette_id),
  foreign key (lesson_version_id, mix_id) references lesson_mixes(lesson_version_id, mix_id) on delete cascade,
  constraint mix_colors_has_value check (recipe_id is not null or estimate is not null)
);
create index if not exists mix_colors_palette_idx on mix_colors (palette_id);
create index if not exists mix_colors_recipe_idx on mix_colors (recipe_id);

alter table lesson_mixes enable row level security;
alter table mix_colors   enable row level security;
revoke all on lesson_mixes, mix_colors from anon, authenticated;
grant select, insert, update, delete on lesson_mixes, mix_colors to service_role;

-- 5. create_lesson ikut menyimpan field v2 (isi lain sama dengan migrasi 12).
create or replace function create_lesson(p jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_lesson uuid;
  v_stage  uuid;
  v_claim  uuid;
  st       jsonb;
  cl       jsonb;
  l        jsonb := p->'lesson';
begin
  insert into lesson_versions (
    artwork_id, origin, owner_session_id, version, source_upload_id, medium, level, scope,
    image_width, image_height, use_shading, style, lineart_method, skill_goal, culture_goal,
    checkpoint_count, ai_text_status, prompt_version, status, reviewer,
    structure_version, landmarks
  ) values (
    (l->>'artwork_id')::uuid, (l->>'origin')::lesson_origin, (l->>'owner_session_id')::uuid,
    coalesce((l->>'version')::int, 1), (l->>'source_upload_id')::uuid,
    coalesce(l->>'medium', 'acrylic'), coalesce(l->>'level', 'beginner'), l->'scope',
    (l->>'image_width')::int, (l->>'image_height')::int, (l->>'use_shading')::boolean,
    coalesce(l->'style', '{}'::jsonb), (l->>'lineart_method')::lineart_method,
    l->>'skill_goal', l->>'culture_goal', (l->>'checkpoint_count')::smallint,
    l->>'ai_text_status', l->>'prompt_version', (l->>'status')::lesson_status, l->>'reviewer',
    coalesce((l->>'structure_version')::smallint, 1), coalesce(l->'landmarks', '[]'::jsonb)
  ) returning id into v_lesson;

  insert into regions (lesson_version_id, code, hex, lab, area_pct, bbox, centroid,
                       is_main_object, is_background, value_level, neighbors, label, mix_id, grid_cells)
  select v_lesson, r->>'code', r->>'hex',
         array(select jsonb_array_elements_text(r->'lab'))::numeric[],
         (r->>'area_pct')::numeric,
         array(select jsonb_array_elements_text(r->'bbox'))::int[],
         array(select jsonb_array_elements_text(r->'centroid'))::int[],
         (r->>'is_main_object')::boolean, (r->>'is_background')::boolean,
         (r->>'value_level')::smallint,
         coalesce(array(select jsonb_array_elements_text(r->'neighbors')), '{}'),
         r->>'label', r->>'mix_id',
         coalesce(array(select jsonb_array_elements_text(r->'grid_cells')), '{}')
    from jsonb_array_elements(p->'regions') r;

  insert into visual_layers (lesson_version_id, kind, bucket, asset_path, format, meta)
  select v_lesson, (x->>'kind')::layer_kind, x->>'bucket', x->>'asset_path', x->>'format',
         coalesce(x->'meta', '{}'::jsonb)
    from jsonb_array_elements(p->'layers') x;

  for st in select * from jsonb_array_elements(p->'stages') loop
    insert into stages (lesson_version_id, code, order_no, kind, layers, is_checkpoint, title, action,
                        tools, done_when, common_mistakes, focus_bbox, text_source,
                        phase, new_lines, grid_cells, mix_id)
    values (
      v_lesson, st->>'code', (st->>'order_no')::smallint, (st->>'kind')::stage_kind,
      array(select jsonb_array_elements_text(st->'layers')),
      (st->>'is_checkpoint')::boolean, st->>'title', st->>'action',
      coalesce(array(select jsonb_array_elements_text(st->'tools')), '{}'),
      st->>'done_when',
      coalesce(array(select jsonb_array_elements_text(st->'common_mistakes')), '{}'),
      case when jsonb_typeof(st->'focus_bbox') = 'array'
           then array(select jsonb_array_elements_text(st->'focus_bbox'))::int[] end,
      st->>'text_source',
      st->>'phase', st->>'new_lines',
      coalesce(array(select jsonb_array_elements_text(st->'grid_cells')), '{}'),
      st->>'mix_id'
    ) returning id into v_stage;

    insert into stage_regions (stage_id, region_id)
    select v_stage, r.id
      from regions r
     where r.lesson_version_id = v_lesson
       and r.code in (select jsonb_array_elements_text(st->'region_codes'));
  end loop;

  insert into region_colors (region_id, palette_id, recipe_id, estimate, reachability, explanation)
  select r.id, (x->>'palette_id')::uuid, (x->>'recipe_id')::uuid,
         nullif(x->'estimate', 'null'::jsonb), x->>'reachability', x->>'explanation'
    from jsonb_array_elements(coalesce(p->'region_colors', '[]'::jsonb)) x
    join regions r on r.lesson_version_id = v_lesson and r.code = x->>'region_code';

  insert into lesson_mixes (lesson_version_id, mix_id, order_no, name, target_hex, target_lab, max_region_delta_e)
  select v_lesson, m->>'mix_id', (m->>'order_no')::smallint, m->>'name', m->>'target_hex',
         array(select jsonb_array_elements_text(m->'target_lab'))::numeric[],
         (m->>'max_region_delta_e')::numeric
    from jsonb_array_elements(coalesce(p->'mixes', '[]'::jsonb)) m;

  insert into mix_colors (lesson_version_id, mix_id, palette_id, recipe_id, estimate, reachability, explanation)
  select v_lesson, x->>'mix_id', (x->>'palette_id')::uuid, (x->>'recipe_id')::uuid,
         nullif(x->'estimate', 'null'::jsonb), x->>'reachability', x->>'explanation'
    from jsonb_array_elements(coalesce(p->'mix_colors', '[]'::jsonb)) x;

  -- Setiap region harus dibuka tepat di satu tahap.
  if (select count(*) from regions where lesson_version_id = v_lesson)
     <> (select count(*) from stage_regions sr join stages s on s.id = sr.stage_id where s.lesson_version_id = v_lesson) then
    raise exception 'tidak semua region masuk ke tahap';
  end if;

  for cl in select * from jsonb_array_elements(coalesce(p->'claims', '[]'::jsonb)) loop
    insert into culture_claims (lesson_version_id, stage_id, text, type, order_no)
    values (
      v_lesson,
      (select id from stages where lesson_version_id = v_lesson and code = cl->>'stage_code'),
      cl->>'text', (cl->>'type')::claim_type, coalesce((cl->>'order_no')::smallint, 0)
    ) returning id into v_claim;

    insert into culture_claim_sources (claim_id, source_id)
    select v_claim, s.id from sources s
     where s.code in (select jsonb_array_elements_text(coalesce(cl->'source_codes', '[]'::jsonb)));

    -- Klaim fakta wajib punya minimal satu sumber yang ada.
    if cl->>'type' = 'fakta' and not exists (select 1 from culture_claim_sources where claim_id = v_claim) then
      raise exception 'klaim fakta tanpa sumber: %', left(cl->>'text', 60);
    end if;
  end loop;

  if p->'reflection' is not null and jsonb_typeof(p->'reflection') = 'object' then
    insert into reflection_questions (lesson_version_id, question, options, correct_option, answer_source_id)
    select v_lesson, p->'reflection'->>'question', p->'reflection'->'options',
           (p->'reflection'->>'correct_option')::smallint, s.id
      from sources s where s.code = p->'reflection'->>'answer_source_code';
  end if;

  if p->>'session_id' is not null then
    update practice_sessions set lesson_version_id = v_lesson where id = (p->>'session_id')::uuid;
  end if;

  return v_lesson;
end;
$$;

revoke all on function create_lesson(jsonb) from public, anon, authenticated;
grant execute on function create_lesson(jsonb) to service_role;
