/**
 * "Potong satu figur": the practice area on a free-mode photo, as fractions
 * 0–1 of the photo (API.md `scope` {x, y, w, h}; w and h must be > 0.05).
 */
import type { Scope } from "./schemas";

export type Box = { x: number; y: number; w: number; h: number };
export type CornerId = "nw" | "ne" | "se" | "sw";

/** Smallest box we allow, a little above the API's 0.05 so rounding never fails it. */
export const MIN_SIDE = 0.08;

export const WHOLE_PHOTO: Box = { x: 0, y: 0, w: 1, h: 1 };

/** A centred box covering most of the photo: a sensible first guess for one figure. */
export const DEFAULT_CROP: Box = { x: 0.2, y: 0.12, w: 0.6, h: 0.76 };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Move the whole box by (dx, dy), keeping it inside the photo. */
export function moveBox(box: Box, dx: number, dy: number): Box {
  return { ...box, x: clamp(box.x + dx, 0, 1 - box.w), y: clamp(box.y + dy, 0, 1 - box.h) };
}

/** Drag one corner by (dx, dy); the opposite corner stays put. */
export function resizeBox(box: Box, corner: CornerId, dx: number, dy: number): Box {
  let left = box.x;
  let top = box.y;
  let right = box.x + box.w;
  let bottom = box.y + box.h;
  if (corner === "nw" || corner === "sw") left = clamp(left + dx, 0, right - MIN_SIDE);
  if (corner === "ne" || corner === "se") right = clamp(right + dx, left + MIN_SIDE, 1);
  if (corner === "nw" || corner === "ne") top = clamp(top + dy, 0, bottom - MIN_SIDE);
  if (corner === "sw" || corner === "se") bottom = clamp(bottom + dy, top + MIN_SIDE, 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** The `scope` form value, rounded so it stays inside the photo. Whole photo → no scope. */
export function toScope(box: Box): Scope | null {
  if (box.x <= 0.001 && box.y <= 0.001 && box.w >= 0.999 && box.h >= 0.999) return null;
  const r = (n: number) => Math.floor(n * 10_000) / 10_000;
  return { x: r(box.x), y: r(box.y), w: r(box.w), h: r(box.h) };
}
