-- Fase 3 · Migrasi 11: simpan satu tutorial secara atomik
-- Semua baris (lesson, region, layer, tahap, region per tahap, klaim budaya + sumber, refleksi)
-- masuk dalam satu transaksi: gagal di tengah → tidak ada tutorial setengah jadi.
--
-- p berbentuk:
-- { lesson: {...kolom lesson_versions},
--   regions: [{code, hex, lab, area_pct, bbox, centroid, is_main_object, is_background, value_level, neighbors, label}],
--   layers: [{kind, bucket, asset_path, format, meta}],
--   stages: [{code, order_no, kind, layers, is_checkpoint, title, action, tools, done_when, common_mistakes,
--             focus_bbox, text_source, region_codes: [..]}],
--   claims: [{text, type, order_no, stage_code, source_codes: [..]}],
--   reflection: {question, options, correct_option, answer_source_code} | null,
--   session_id: uuid | null   -- bila diisi, sesi dikunci ke lesson ini }

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
    checkpoint_count, ai_text_status, prompt_version, status, reviewer
  ) values (
    (l->>'artwork_id')::uuid, (l->>'origin')::lesson_origin, (l->>'owner_session_id')::uuid,
    coalesce((l->>'version')::int, 1), (l->>'source_upload_id')::uuid,
    coalesce(l->>'medium', 'acrylic'), coalesce(l->>'level', 'beginner'), l->'scope',
    (l->>'image_width')::int, (l->>'image_height')::int, (l->>'use_shading')::boolean,
    coalesce(l->'style', '{}'::jsonb), (l->>'lineart_method')::lineart_method,
    l->>'skill_goal', l->>'culture_goal', (l->>'checkpoint_count')::smallint,
    l->>'ai_text_status', l->>'prompt_version', (l->>'status')::lesson_status, l->>'reviewer'
  ) returning id into v_lesson;

  insert into regions (lesson_version_id, code, hex, lab, area_pct, bbox, centroid,
                       is_main_object, is_background, value_level, neighbors, label)
  select v_lesson, r->>'code', r->>'hex',
         array(select jsonb_array_elements_text(r->'lab'))::numeric[],
         (r->>'area_pct')::numeric,
         array(select jsonb_array_elements_text(r->'bbox'))::int[],
         array(select jsonb_array_elements_text(r->'centroid'))::int[],
         (r->>'is_main_object')::boolean, (r->>'is_background')::boolean,
         (r->>'value_level')::smallint,
         coalesce(array(select jsonb_array_elements_text(r->'neighbors')), '{}'),
         r->>'label'
    from jsonb_array_elements(p->'regions') r;

  insert into visual_layers (lesson_version_id, kind, bucket, asset_path, format, meta)
  select v_lesson, (x->>'kind')::layer_kind, x->>'bucket', x->>'asset_path', x->>'format',
         coalesce(x->'meta', '{}'::jsonb)
    from jsonb_array_elements(p->'layers') x;

  for st in select * from jsonb_array_elements(p->'stages') loop
    insert into stages (lesson_version_id, code, order_no, kind, layers, is_checkpoint, title, action,
                        tools, done_when, common_mistakes, focus_bbox, text_source)
    values (
      v_lesson, st->>'code', (st->>'order_no')::smallint, (st->>'kind')::stage_kind,
      array(select jsonb_array_elements_text(st->'layers')),
      (st->>'is_checkpoint')::boolean, st->>'title', st->>'action',
      coalesce(array(select jsonb_array_elements_text(st->'tools')), '{}'),
      st->>'done_when',
      coalesce(array(select jsonb_array_elements_text(st->'common_mistakes')), '{}'),
      case when jsonb_typeof(st->'focus_bbox') = 'array'
           then array(select jsonb_array_elements_text(st->'focus_bbox'))::int[] end,
      st->>'text_source'
    ) returning id into v_stage;

    insert into stage_regions (stage_id, region_id)
    select v_stage, r.id
      from regions r
     where r.lesson_version_id = v_lesson
       and r.code in (select jsonb_array_elements_text(st->'region_codes'));
  end loop;

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
