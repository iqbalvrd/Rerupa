/**
 * Pure helpers for the practice screen (RENCANA §4.5, API.md "Membaca GET /lessons/{id}").
 * No React, no DOM except parseRegionsSvg (which takes a DOMParser).
 */
import type { Lesson, Mix, Phase, Region, RegionColor, Stage } from "./schemas";

/** Layer toggles, in the order they appear in the UI. */
export type LayerKey =
  | "grid"
  | "landmarks"
  | "block_in"
  | "background_lines"
  | "sketch"
  | "lineart"
  | "main_object"
  | "regions"
  | "value"
  | "original_photo";

export const LAYER_LABELS: Record<LayerKey, string> = {
  grid: "Grid",
  landmarks: "Titik patokan",
  block_in: "Bentuk kasar",
  background_lines: "Garis latar",
  sketch: "Sketsa",
  lineart: "Garis bantu",
  main_object: "Objek utama",
  regions: "Kelompok warna",
  value: "Terang-gelap",
  original_photo: "Foto asli",
};

const ORDER: LayerKey[] = [
  "grid",
  "landmarks",
  "block_in",
  "background_lines",
  "sketch",
  "lineart",
  "main_object",
  "regions",
  "value",
  "original_photo",
];

/** Line layers from rough to fine (v2 line levels 1–3), drawn in this order. */
export const LINE_LAYERS = ["block_in", "background_lines", "sketch", "lineart"] as const;

/** Toggles this lesson can offer: only layers it has; terang-gelap only when use_shading. */
export function availableLayers(lesson: Lesson): LayerKey[] {
  const kinds = new Set(lesson.layers.map((l) => l.kind));
  if (lesson.landmarks?.length) kinds.add("landmarks");
  return ORDER.filter((k) => kinds.has(k) && (k !== "value" || lesson.use_shading));
}

/**
 * What a stage shows before the user touches any toggle: the stage's own
 * `layers`. The original photo stays off until asked for (it covers the guide).
 */
export function defaultVisibility(stage: Stage, available: LayerKey[]): Record<LayerKey, boolean> {
  const shown = new Set(stage.layers);
  return Object.fromEntries(
    ORDER.map((k) => [k, available.includes(k) && k !== "original_photo" && shown.has(k)]),
  ) as Record<LayerKey, boolean>;
}

/** Regions painted by the end of stage `index` (0-based): all new_region_codes of stages 1..N. */
export function regionsUpTo(stages: Stage[], index: number): Set<string> {
  const codes = new Set<string>();
  for (const stage of stages.slice(0, index + 1)) for (const c of stage.new_region_codes) codes.add(c);
  return codes;
}

/** Number shown on the canvas and on its colour recipe: "r07" → 7. */
export function regionNumber(code: string): string {
  const n = Number.parseInt(code.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? String(n) : code;
}

export function regionColorsFor(stage: Stage, colors: RegionColor[]): RegionColor[] {
  const wanted = new Set(stage.new_region_codes);
  return colors.filter((c) => wanted.has(c.region_code));
}

export function regionsByCode(regions: Region[]): Map<string, Region> {
  return new Map(regions.map((r) => [r.code, r]));
}

/**
 * Pull one path per region out of regions.svg (`<path id="rNN" d="…">`), so
 * each region can be shown, hidden or highlighted on its own.
 */
export function parseRegionsSvg(text: string, parser: DOMParser): Map<string, string> {
  const doc = parser.parseFromString(text, "image/svg+xml");
  if (doc.querySelector("parsererror")) return new Map();
  const paths = new Map<string, string>();
  for (const el of doc.querySelectorAll("path[id]")) {
    const d = el.getAttribute("d");
    if (d) paths.set(el.id, d);
  }
  return paths;
}

/** Index (0-based) to open: the session's current stage, clamped to the lesson. */
export function initialStageIndex(stageCount: number, currentStageOrder: number | undefined): number {
  if (!stageCount) return 0;
  const order = currentStageOrder && currentStageOrder > 0 ? currentStageOrder : 1;
  return Math.min(order, stageCount) - 1;
}

/** Whether the stage text was written automatically (AI or template), which the UI must say. */
export function isGeneratedText(lesson: Lesson, stage: Stage): boolean {
  return lesson.generated_automatically || stage.text_source === "ai" || stage.text_source === "template";
}

/**
 * The first stage that paints any of `regionCodes` (its `new_region_codes`),
 * so tapping a story character opens the stage where that figure is painted.
 */
export function firstStageForRegions(stages: Stage[], regionCodes: string[]): Stage | null {
  if (!regionCodes.length) return null;
  const wanted = new Set(regionCodes);
  const ordered = [...stages].sort((a, b) => a.order_no - b.order_no);
  return ordered.find((s) => s.new_region_codes.some((c) => wanted.has(c))) ?? null;
}

/** Index (0-based) of the stage with `code`, or null when the lesson has none. */
export function stageIndexByCode(stages: Stage[], code: string | null | undefined): number | null {
  if (!code) return null;
  const i = stages.findIndex((s) => s.code === code);
  return i >= 0 ? i : null;
}

// ── Tutorial v2 ("tutorial bertahap": 3 phases, ±16 small steps) ───────────

/** Lessons with `structure_version: 2` and phases; everything else is the 8-stage v1 lesson. */
export function isStepped(lesson: Lesson): lesson is Lesson & { phases: Phase[] } {
  return lesson.structure_version === 2 && Boolean(lesson.phases?.length);
}

export type PhaseView = {
  phases: { code: string; title: string; count: number; done: number; current: boolean }[];
  /** The phase of the open step, and the step's place in it (1-based). */
  phase: { code: string; title: string; step: number; count: number } | null;
};

/**
 * The 3-phase header for step `index` (0-based): each phase with its step
 * count and how many of its steps are completed, plus where the open step is.
 */
export function phaseView(lesson: Lesson, index: number, isDone: (code: string) => boolean): PhaseView {
  if (!isStepped(lesson)) return { phases: [], phase: null };
  const code = lesson.stages[index]?.code;
  let phase: PhaseView["phase"] = null;
  const phases = lesson.phases.map((p) => {
    const at = code ? p.stage_codes.indexOf(code) : -1;
    if (at >= 0) phase = { code: p.code, title: p.title, step: at + 1, count: p.stage_codes.length };
    return {
      code: p.code,
      title: p.title,
      count: p.stage_codes.length,
      done: p.stage_codes.filter(isDone).length,
      current: at >= 0,
    };
  });
  return { phases, phase };
}

/** Grid size from the grid layer's meta (`cols`, `rows`), or null when the lesson has no grid. */
export function gridSize(lesson: Lesson): { cols: number; rows: number } | null {
  const meta = lesson.layers.find((l) => l.kind === "grid")?.meta;
  const cols = Number(meta?.cols);
  const rows = Number(meta?.rows);
  return cols > 0 && rows > 0 ? { cols, rows } : null;
}

/** "B3" → column 1, row 2 (0-based). Columns are letters from the left, rows numbers from the top. */
export function parseCell(cell: string): { col: number; row: number } | null {
  const m = /^([A-Z])(\d+)$/.exec(cell.trim().toUpperCase());
  if (!m) return null;
  return { col: m[1].charCodeAt(0) - 65, row: Number(m[2]) - 1 };
}

/** Column letter for a 0-based column index. */
export function columnName(col: number): string {
  return String.fromCharCode(65 + col);
}

/**
 * Box `[x, y, w, h]` around the given grid cells, in image space, to zoom to.
 * Null when there are none, or when they cover the whole grid (nothing to zoom to).
 */
export function cellsBox(
  cells: readonly string[] | undefined,
  grid: { cols: number; rows: number },
  width: number,
  height: number,
): [number, number, number, number] | null {
  const parsed = (cells ?? [])
    .map(parseCell)
    .filter((c): c is { col: number; row: number } => c !== null && c.col < grid.cols && c.row < grid.rows);
  if (!parsed.length || parsed.length >= grid.cols * grid.rows) return null;
  const cw = width / grid.cols;
  const ch = height / grid.rows;
  const c0 = Math.min(...parsed.map((c) => c.col));
  const c1 = Math.max(...parsed.map((c) => c.col));
  const r0 = Math.min(...parsed.map((c) => c.row));
  const r1 = Math.max(...parsed.map((c) => c.row));
  return [c0 * cw, r0 * ch, (c1 - c0 + 1) * cw, (r1 - r0 + 1) * ch];
}

/** The one mix a `paint_mix` step uses. */
export function mixFor(lesson: Lesson, stage: Stage): Mix | null {
  if (!stage.mix_id) return null;
  return lesson.mixes?.find((m) => m.mix_id === stage.mix_id) ?? null;
}

/** Index (0-based) of a mix among the lesson's mixes, for "Campuran 2 dari 6". */
export function mixPosition(lesson: Lesson, mix: Mix): { n: number; of: number } {
  const ordered = [...(lesson.mixes ?? [])].sort((a, b) => a.order_no - b.order_no);
  return { n: ordered.findIndex((m) => m.mix_id === mix.mix_id) + 1, of: ordered.length };
}
