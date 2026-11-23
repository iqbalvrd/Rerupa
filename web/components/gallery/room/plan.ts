/**
 * Floor plan and camera poses of the 3D gallery hall. Pure functions, so the
 * layout can be unit tested without WebGL.
 *
 * A grand skylit hall after the great museum courts: the visitor enters at
 * the front and faces one wall where the whole collection hangs in an arcade,
 * row above row, so every painting is in view at once and faces the visitor.
 * Nothing hangs on the side walls, and there is no looking around: choosing a
 * painting walks the camera straight up to it.
 *
 * The arcade's columns and rows follow the screen: wide on a laptop, tall on a
 * phone held upright, so the wall always fills the view.
 *
 * Axes: x right, y up, z toward the entrance. The hung wall is the plane
 * z = -depth/2. Yaw 0 looks at it.
 */

import { DEFAULT_FRAME, FRAME_STYLES } from "../frames";

export type Vec3 = [number, number, number];

export const HALL = {
  /** Width of one arcade bay (one painting). */
  bayW: 3.4,
  /** Height of one arcade level. */
  levelH: 3.3,
  /** Height of the plinth under the lowest level. */
  plinth: 1.1,
  /** Largest painting (canvas only), in meters. */
  maxW: 2.2,
  maxH: 1.75,
  /** Floor beyond the arcade on each side of the hung wall. */
  sideMargin: 4,
  /** Eye height of a standing visitor. */
  eye: 1.7,
} as const;

export type Slot = {
  index: number;
  row: number;
  col: number;
  center: Vec3;
};

export type RoomPlan = {
  cols: number;
  rows: number;
  /** Arcade on the hung wall: width and height (above the plinth). */
  arcadeW: number;
  arcadeH: number;
  /** Hall interior. */
  width: number;
  depth: number;
  /** Top of the side walls, where the skylight vault starts. */
  springY: number;
  slots: Slot[];
};

/**
 * Columns for `count` paintings: the arcade whose shape is closest to the
 * screen's, with few empty bays.
 */
export function arcadeColumns(count: number, aspect: number) {
  const n = Math.max(1, count);
  let best = 1;
  let bestScore = Infinity;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    if (rows > 4) continue;
    const shape = (cols * HALL.bayW) / (rows * HALL.levelH);
    const empty = cols * rows - n;
    const score = Math.abs(Math.log(shape / Math.max(0.3, aspect * 0.9))) + empty * 0.35;
    if (score < bestScore) {
      bestScore = score;
      best = cols;
    }
  }
  return best;
}

/** Vertical field of view (degrees) by viewport aspect, like the landing. */
export function fovFor(aspect: number) {
  return aspect < 0.8 ? 64 : aspect < 1.2 ? 58 : 52;
}

function tans(aspect: number) {
  const v = (fovFor(aspect) * Math.PI) / 180;
  const tanV = Math.tan(v / 2);
  return { tanV, tanH: tanV * aspect };
}

/**
 * How far back the visitor stands to take in the hall: the arcade fills about
 * 60% of the view's height (or 80% of its width), leaving the floor below and
 * the skylight vault above in view, as in a photograph of a great hall.
 */
function overviewDistance(arcadeW: number, arcadeH: number, aspect: number) {
  const { tanV, tanH } = tans(aspect);
  const w = arcadeW + 1.2;
  const h = arcadeH + HALL.plinth;
  return Math.max(h / (2 * tanV * 0.6), w / (2 * tanH * 0.8));
}

/** Lay out `count` paintings on the hung wall, reading order: left to right, top to bottom. */
export function planRoom(count: number, aspect = 16 / 9): RoomPlan {
  const n = Math.max(1, count);
  const cols = arcadeColumns(n, aspect);
  const rows = Math.ceil(n / cols);
  const arcadeW = cols * HALL.bayW;
  const arcadeH = rows * HALL.levelH;
  const width = arcadeW + 2 * HALL.sideMargin;
  const springY = HALL.plinth + arcadeH + 1.6;
  const view = overviewDistance(arcadeW, arcadeH, aspect);
  const depth = Math.max(14, view + 6);
  const slots: Slot[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    // The last row is centered when it is not full.
    const inRow = row === rows - 1 ? n - row * cols : cols;
    const x = (col - (inRow - 1) / 2) * HALL.bayW;
    const y = HALL.plinth + arcadeH - (row + 0.5) * HALL.levelH;
    slots.push({ index: i, row, col, center: [x, y, -depth / 2] });
  }
  return { cols, rows, arcadeW, arcadeH, width, depth, springY, slots };
}

/** Painting size in meters: the image's aspect ratio fitted into HALL.maxW × HALL.maxH. */
export function paintingSize(aspect: number): { w: number; h: number } {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 4 / 5;
  return a >= HALL.maxW / HALL.maxH ? { w: HALL.maxW, h: HALL.maxW / a } : { w: HALL.maxH * a, h: HALL.maxH };
}

/** Frame width around a painting, in meters: the same share of the shorter side as Sheva's frame on the artwork page (frames.ts). */
export function frameWidth(size: { w: number; h: number }) {
  return Math.min(0.34, Math.max(0.08, FRAME_STYLES[DEFAULT_FRAME].thickness * Math.min(size.w, size.h)));
}

export type Pose = { pos: Vec3; yaw: number; pitch: number };

/** Standing at the front of the hall, the whole arcade in view. */
export function overviewPose(plan: RoomPlan, aspect: number): Pose {
  const d = overviewDistance(plan.arcadeW, plan.arcadeH, aspect);
  // Look at a point a little above the arcade's middle, from standing height, so
  // the view takes in the floor, the arcade and the start of the vault.
  const cy = HALL.plinth + plan.arcadeH * 0.6;
  const y = HALL.eye + 0.8;
  const pitch = Math.atan2(cy - y, d);
  return { pos: [0, y, -plan.depth / 2 + d], yaw: 0, pitch };
}

/** A few steps back, at the entrance: where the walk in from the landing starts. */
export function entrancePose(plan: RoomPlan, aspect: number): Pose {
  const o = overviewPose(plan, aspect);
  return { ...o, pos: [o.pos[0], o.pos[1] - 0.2, Math.min(plan.depth / 2 - 0.5, o.pos[2] + 4)] };
}

/**
 * In front of a painting, far enough that it (with frame) fills about 46% of
 * the view's height or 70% of its width (86% on an upright phone), whichever
 * is tighter, and a little low so the painting sits above the plaque and
 * controls at the bottom.
 */
export function slotPose(plan: RoomPlan, slot: Slot, size: { w: number; h: number }, aspect: number): Pose {
  const fw = frameWidth(size);
  const w = size.w + 2 * fw;
  const h = size.h + 2 * fw;
  const { tanV, tanH } = tans(aspect);
  const widthShare = aspect < 0.8 ? 0.86 : 0.7;
  const d = Math.min(Math.max(h / (2 * tanV * 0.46), w / (2 * tanH * widthShare)), plan.depth - 1);
  const [cx, cy, cz] = slot.center;
  return { pos: [cx, cy - h * 0.3, cz + d], yaw: 0, pitch: 0 };
}

/** Shortest signed angle from `a` to `b`. */
export function angleDelta(a: number, b: number) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    pos: [a.pos[0] + (b.pos[0] - a.pos[0]) * t, a.pos[1] + (b.pos[1] - a.pos[1]) * t, a.pos[2] + (b.pos[2] - a.pos[2]) * t],
    yaw: a.yaw + angleDelta(a.yaw, b.yaw) * t,
    pitch: a.pitch + (b.pitch - a.pitch) * t,
  };
}

/** Seconds to walk between two poses: longer walks take longer, within a short guided move. */
export function walkSeconds(a: Pose, b: Pose) {
  const dist = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]);
  return Math.min(2.2, Math.max(1, 0.85 + dist * 0.09));
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
