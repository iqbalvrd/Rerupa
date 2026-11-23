/**
 * Zod schemas for every API response the web app reads.
 *
 * Source of truth: the Pydantic response models in `api/routes/*.py`.
 * One schema, two sides: when a Pydantic model changes, update the matching
 * schema here in the same commit. `lib/schemas.test.ts` validates every file in
 * `api/examples/` against these schemas.
 */
import { z } from "zod";

// ── Shared ────────────────────────────────────────────────────────────────

/** `[x, y, w, h]` in the lesson's `image_width × image_height` space. */
export const BBox = z.array(z.number()).length(4);
export type BBox = z.infer<typeof BBox>;

export const ApiErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.array(z.string()).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

// ── Sessions (routes/sessions.py) ─────────────────────────────────────────

export const CanvasSize = z.enum(["A4", "A3", "30x40"]);
export type CanvasSize = z.infer<typeof CanvasSize>;

export const Session = z.object({
  id: z.uuid(),
  lesson_version_id: z.uuid().nullable(),
  palette_id: z.uuid().nullable(),
  canvas_size: CanvasSize.nullable(),
  current_stage_order: z.number().int(),
  consent: z.record(z.string(), z.unknown()),
  expires_at: z.string(),
  /** Only on `POST /sessions`: sent back as `X-Session-Token` when the cookie is blocked. */
  session_token: z.string().nullish(),
});
export type Session = z.infer<typeof Session>;

export type SessionCreate = {
  palette_id?: string | null;
  canvas_size?: CanvasSize | null;
  lesson_version_id?: string | null;
};

export type SessionUpdate = SessionCreate & {
  current_stage_order?: number | null;
};

// ── Jobs (routes/jobs.py) ─────────────────────────────────────────────────

export const JobStatus = z.enum([
  "queued",
  "processing",
  "succeeded",
  "needs_retake",
  "failed",
]);
export type JobStatus = z.infer<typeof JobStatus>;

export const Job = z.object({
  id: z.uuid(),
  type: z.string(),
  status: JobStatus,
  is_final: z.boolean(),
  progress: z.object({ step: z.string().optional() }).catchall(z.unknown()),
  result: z.record(z.string(), z.unknown()).nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  lesson_version_id: z.uuid().nullable(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
});
export type Job = z.infer<typeof Job>;

// ── Artworks (routes/artworks.py) ─────────────────────────────────────────

export const Source = z.object({
  code: z.string(),
  title: z.string(),
  publisher: z.string().nullable(),
  url: z.string().nullable(),
  claim_note: z.string().nullable(),
});
export type Source = z.infer<typeof Source>;

export const ArtworkCard = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  /** null = unknown. Never guessed. */
  artist: z.string().nullable(),
  tradition: z.string().nullable(),
  region_origin: z.string().nullable(),
  license: z.string(),
  license_note: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  lesson_version_id: z.uuid().nullable(),
});
export type ArtworkCard = z.infer<typeof ArtworkCard>;

export const ArtworkDetail = ArtworkCard.extend({
  image_url: z.string().nullable(),
  adaptation_scope: z.string().nullable(),
  sources: z.array(Source),
});
export type ArtworkDetail = z.infer<typeof ArtworkDetail>;

// ── Lessons (routes/lessons.py) ───────────────────────────────────────────

export const LayerKind = z.enum([
  "grid",
  "sketch",
  "main_object",
  "regions",
  "value",
  "lineart",
  "original_photo",
]);
export type LayerKind = z.infer<typeof LayerKind>;

export const Layer = z.object({
  /** Known kinds are listed in `LayerKind`; kept as string so a new kind does not break the page. */
  kind: z.string(),
  format: z.string(),
  /** null when the file was purged (24 h retention). */
  url: z.string().nullable(),
  meta: z.record(z.string(), z.unknown()),
  purged: z.boolean().default(false),
});
export type Layer = z.infer<typeof Layer>;

export const Region = z.object({
  code: z.string(),
  hex: z.string(),
  area_pct: z.number(),
  bbox: BBox,
  centroid: z.array(z.number()).length(2),
  is_main_object: z.boolean(),
  is_background: z.boolean(),
  value_level: z.number().int().nullable(),
  label: z.string().nullable(),
});
export type Region = z.infer<typeof Region>;

export const Stage = z.object({
  code: z.string(),
  order_no: z.number().int(),
  kind: z.string(),
  is_checkpoint: z.boolean(),
  layers: z.array(z.string()),
  new_region_codes: z.array(z.string()),
  title: z.string(),
  action: z.string(),
  tools: z.array(z.string()),
  done_when: z.string(),
  common_mistakes: z.array(z.string()),
  focus_bbox: BBox.nullable(),
  text_source: z.string(),
});
export type Stage = z.infer<typeof Stage>;

export const SourceRef = z.object({
  code: z.string(),
  title: z.string(),
  url: z.string().nullable(),
});
export type SourceRef = z.infer<typeof SourceRef>;

export const CultureClaim = z.object({
  stage_code: z.string().nullable(),
  text: z.string(),
  /** "fakta" must show its sources; everything else is shown as an AI estimate. */
  type: z.string(),
  sources: z.array(SourceRef),
});
export type CultureClaim = z.infer<typeof CultureClaim>;

export const Reflection = z.object({
  question: z.string(),
  options: z.array(z.string()),
  correct_option: z.number().int(),
  source: SourceRef.nullable(),
});
export type Reflection = z.infer<typeof Reflection>;

export const ColorComponent = z.object({
  paint_code: z.string(),
  name: z.string(),
  hex: z.string(),
  parts: z.number().int(),
});
export type ColorComponent = z.infer<typeof ColorComponent>;

export const RegionColor = z.object({
  region_code: z.string(),
  palette_id: z.uuid(),
  /** recipe | estimate | hard */
  reachability: z.string(),
  label: z.string(),
  recipe_id: z.uuid().nullable(),
  components: z.array(ColorComponent),
  mixed_hex: z.string().nullable(),
  delta_e: z.number().nullable(),
  explanation: z.string().nullable(),
  tips: z.array(z.string()),
});
export type RegionColor = z.infer<typeof RegionColor>;

export const Lesson = z.object({
  id: z.uuid(),
  origin: z.string(),
  artwork_id: z.uuid().nullable(),
  image_width: z.number().int().positive(),
  image_height: z.number().int().positive(),
  use_shading: z.boolean(),
  checkpoint_count: z.number().int(),
  /** ai | template | curated */
  ai_text_status: z.string(),
  generated_automatically: z.boolean(),
  skill_goal: z.string().nullable(),
  culture_goal: z.string().nullable(),
  layers: z.array(Layer),
  regions: z.array(Region),
  stages: z.array(Stage),
  culture_claims: z.array(CultureClaim),
  reflection: Reflection.nullable(),
  palette_id: z.uuid().nullable(),
  region_colors: z.array(RegionColor),
});
export type Lesson = z.infer<typeof Lesson>;

/** Body of `scope` on `POST /lessons/generate`: fractions 0–1 of the photo. */
export const Scope = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().gt(0.05).max(1),
    h: z.number().gt(0.05).max(1),
  })
  .refine((s) => s.x + s.w <= 1.0001 && s.y + s.h <= 1.0001, {
    message: "cakupan keluar dari foto",
  });
export type Scope = z.infer<typeof Scope>;

// ── Palettes & recipes (routes/palettes.py) ───────────────────────────────

export const Paint = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  hex: z.string(),
  pigment_code: z.string().nullable(),
});
export type Paint = z.infer<typeof Paint>;

export const Palette = z.object({
  id: z.uuid(),
  name: z.string(),
  brand: z.string(),
  series: z.string(),
  paints: z.array(Paint),
});
export type Palette = z.infer<typeof Palette>;

export const Recipe = z.object({
  id: z.uuid(),
  palette_id: z.uuid(),
  /** tested | estimated */
  kind: z.string(),
  label: z.string(),
  target_hex: z.string(),
  delta_e: z.number(),
  components: z.array(
    z.object({
      paint_id: z.uuid(),
      paint_code: z.string().nullable(),
      name: z.string().nullable(),
      hex: z.string().nullable(),
      parts: z.number().int(),
    }),
  ),
  correction_tips: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).nullable(),
  tested_at: z.string().nullable(),
  tested_by: z.string().nullable(),
});
export type Recipe = z.infer<typeof Recipe>;

// ── Progress & events (routes/progress.py) ────────────────────────────────

export const StageProgressStatus = z.enum(["not_started", "viewed", "completed"]);
export type StageProgressStatus = z.infer<typeof StageProgressStatus>;

export const StageProgress = z.object({
  code: z.string(),
  order_no: z.number().int(),
  is_checkpoint: z.boolean(),
  status: StageProgressStatus,
  viewed_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  feedback_count: z.number().int(),
});
export type StageProgress = z.infer<typeof StageProgress>;

export const Progress = z.object({
  lesson_version_id: z.uuid(),
  current_stage_order: z.number().int(),
  completed_count: z.number().int(),
  stage_count: z.number().int(),
  stages: z.array(StageProgress),
});
export type Progress = z.infer<typeof Progress>;

/** Event names the API accepts from the UI. Others are recorded by the backend itself. */
export const EventName = z.enum([
  "lesson_viewed",
  "recipe_opened",
  "original_photo_opened",
  "feedback_shown",
  "reflection_answered",
  "story_opened",
  "recognition_confirmed",
]);
export type EventName = z.infer<typeof EventName>;

/** The only prop keys the API keeps; anything else is dropped server-side. */
export type EventProps = {
  stage_order?: number;
  origin?: string;
  lesson_version_id?: string;
  correct?: boolean;
};

// ── Checkpoints (routes/checkpoints.py) ───────────────────────────────────

export const Suggestion = z.object({
  /** `rNN` = a region, `main` = main object silhouette, `sketch` = the whole sketch shifted. */
  region_code: z.string(),
  observation: z.string(),
  action: z.string(),
  /** Only present when alignment succeeded. */
  bbox: BBox.nullable(),
});
export type Suggestion = z.infer<typeof Suggestion>;

export const Checkpoint = z.object({
  job_id: z.uuid(),
  stage_code: z.string().nullable(),
  status: z.string(),
  is_final: z.boolean(),
  needs_retake: z.boolean().nullable(),
  retake_code: z.string().nullable(),
  retake_message: z.string().nullable(),
  reasons: z.array(z.string()),
  image_quality: z.string().nullable(),
  alignment: z.string().nullable(),
  summary: z.string().nullable(),
  suggestions: z.array(Suggestion),
  text_source: z.string().nullable(),
  generated_automatically: z.boolean(),
  /** Aligned photo (same ratio as the lesson); null after it was purged. */
  photo_url: z.string().nullable(),
  created_at: z.string(),
});
export type Checkpoint = z.infer<typeof Checkpoint>;

/** `corners` on `POST /sessions/{id}/checkpoints`: 4 points in natural photo pixels. */
export type Corners = [number, number, number, number, number, number, number, number];

// ── Storyline cerita (routes/stories.py, P1) ──────────────────────────────

/** Body of `POST /lessons/{id}/story`. Every field is optional. */
export type StoryRequest = {
  title_hint?: string | null;
  artist_hint?: string | null;
  origin_hint?: string | null;
  confirm_artwork_id?: string | null;
  interpretation_only?: boolean;
  consent_ai_photo?: boolean;
};

/** 200 `{ story_id }` (already exists) or 202 `{ job }` (being made). */
export const StoryStart = z.object({
  story_id: z.uuid().nullable().optional(),
  job: Job.nullable().optional(),
});
export type StoryStart = z.infer<typeof StoryStart>;

export const StorySource = z.object({
  url: z.string(),
  title: z.string(),
  domain: z.string(),
});
export type StorySource = z.infer<typeof StorySource>;

export const StoryClaim = z.object({
  text: z.string(),
  /** fakta | perkiraan. Kept as string; anything but a sourced "fakta" is shown as an estimate. */
  type: z.string(),
  source_urls: z.array(z.string()),
});
export type StoryClaim = z.infer<typeof StoryClaim>;

export const StoryCharacter = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string(),
  region_codes: z.array(z.string()),
});
export type StoryCharacter = z.infer<typeof StoryCharacter>;

export const StoryPanel = z.object({
  order_no: z.number().int(),
  narration: z.string(),
  /** generated | artwork_crop | text */
  kind: z.string(),
  /** pending | ready | text_only */
  status: z.string(),
  image_url: z.string().nullable(),
  /** "Ilustrasi AI" | "Potongan karya asli"; always shown on a panel with an image. */
  image_label: z.string().nullable(),
  purged: z.boolean().default(false),
  character_codes: z.array(z.string()),
  focus_region_codes: z.array(z.string()),
});
export type StoryPanel = z.infer<typeof StoryPanel>;

/**
 * Who the story is about. The research-agent flow (branch feat/story-agen-riset)
 * adds `source`, `confidence` and `reason`, so every field is optional.
 */
export const StoryIdentity = z
  .object({
    title: z.string().nullable().optional(),
    artist: z.string().nullable().optional(),
    origin: z.string().nullable().optional(),
    /** user | ai_research */
    source: z.string().nullable().optional(),
    /** high | medium | low */
    confidence: z.string().nullable().optional(),
    reason: z.string().nullable().optional(),
  })
  .catchall(z.unknown());
export type StoryIdentity = z.infer<typeof StoryIdentity>;

export const Story = z.object({
  id: z.uuid(),
  lesson_version_id: z.uuid(),
  /** generating | ready | text_only | failed */
  status: z.string(),
  /** curated | sourced | user_hint | ai_interpretation */
  story_basis: z.string(),
  /** Shown as given, above the story. Never rewritten by the UI. */
  basis_label: z.string(),
  basis_note: z.string(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  identity: StoryIdentity,
  claims: z.array(StoryClaim),
  sources: z.array(StorySource),
  characters: z.array(StoryCharacter),
  panels: z.array(StoryPanel),
});
export type Story = z.infer<typeof Story>;

/** `result` of a `generate_story` job. `kind` is loose so a new kind does not break the page. */
export const StoryJobResult = z
  .object({
    kind: z.string(),
    story_id: z.uuid().nullable().optional(),
    candidate: z
      .object({
        title: z.string().nullable().optional(),
        artist: z.string().nullable().optional(),
        origin: z.string().nullable().optional(),
        confidence: z.string().nullable().optional(),
        reason: z.string().nullable().optional(),
      })
      .catchall(z.unknown())
      .nullable()
      .optional(),
  })
  .catchall(z.unknown());
export type StoryJobResult = z.infer<typeof StoryJobResult>;
