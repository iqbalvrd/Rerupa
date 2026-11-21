/**
 * Corner taps for checkpoint photos (API.md "Form POST /sessions/{id}/checkpoints").
 * Corners are in natural photo pixels (naturalWidth × naturalHeight, orientation
 * already applied by the browser), never CSS pixels. Order is free.
 */
import type { Corners } from "./schemas";

export type Point = { x: number; y: number };

/** CSS position inside the displayed image → natural photo pixels, clamped to the photo. */
export function toNatural(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  natural: { width: number; height: number },
): Point {
  const x = ((clientX - rect.left) / rect.width) * natural.width;
  const y = ((clientY - rect.top) / rect.height) * natural.height;
  return { x: clamp(x, 0, natural.width), y: clamp(y, 0, natural.height) };
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** The whole photo as the grid area, for photos already cropped to the canvas. */
export function fullPhotoCorners(width: number, height: number): Point[] {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

/** Points sorted around their centre, so the outline never crosses itself whatever the tap order. */
export function polygonOrder(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const cx = points.reduce((a, p) => a + p.x, 0) / points.length;
  const cy = points.reduce((a, p) => a + p.y, 0) / points.length;
  return points.toSorted((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
}

/** The `corners` form value: 8 whole numbers [x1,y1,…,x4,y4]. */
export function toCornersPayload(points: Point[]): Corners {
  if (points.length !== 4) throw new Error("Need exactly 4 corners");
  return points.flatMap((p) => [Math.round(p.x), Math.round(p.y)]) as Corners;
}

/** A stable signature of a submission, to reuse its Idempotency-Key only for the same photo + corners. */
export function submissionSignature(fileName: string, fileSize: number, points: Point[], consent: boolean): string {
  return [fileName, fileSize, consent, ...points.flatMap((p) => [Math.round(p.x), Math.round(p.y)])].join("|");
}
