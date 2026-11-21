/**
 * Pure helpers for the practice screen (RENCANA §4.5, API.md "Membaca GET /lessons/{id}").
 * No React, no DOM except parseRegionsSvg (which takes a DOMParser).
 */
import type { Lesson, Region, RegionColor, Stage } from "./schemas";

/** Layer toggles, in the order they appear in the UI. */
export type LayerKey = "grid" | "sketch" | "lineart" | "main_object" | "regions" | "value" | "original_photo";

export const LAYER_LABELS: Record<LayerKey, string> = {
  grid: "Grid",
  sketch: "Sketsa",
  lineart: "Garis bantu",
  main_object: "Objek utama",
  regions: "Kelompok warna",
  value: "Terang-gelap",
  original_photo: "Foto asli",
};

const ORDER: LayerKey[] = ["grid", "sketch", "lineart", "main_object", "regions", "value", "original_photo"];

/** Toggles this lesson can offer: only layers it has; terang-gelap only when use_shading. */
export function availableLayers(lesson: Lesson): LayerKey[] {
  const kinds = new Set(lesson.layers.map((l) => l.kind));
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
