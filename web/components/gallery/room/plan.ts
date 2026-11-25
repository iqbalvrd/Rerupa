/** A skylit gallery with paintings on the back and both side walls. */

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
  wall: "back" | "left" | "right";
  rotation: number;
  upper?: boolean;
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

/** Balance exhibits across three walls; preserve the collection's navigation order. */
export function planRoom(count: number, aspect = 16 / 9): RoomPlan {
  const n = Math.max(1, count);
  const backCount = Math.ceil(n / 3);
  const leftCount = Math.ceil((n - backCount) / 2);
  const rightCount = n - backCount - leftCount;
  const cols = Math.min(3, backCount);
  const rows = Math.ceil(backCount / cols);
  const arcadeW = cols * HALL.bayW;
  const arcadeH = rows * HALL.levelH;
  const width = Math.max(10.8, arcadeW + 3.2);
  const springY = Math.max(8.6, HALL.plinth + arcadeH + 4.2);
  const view = overviewDistance(arcadeW, arcadeH, aspect);
  // Leave room behind the overview camera so the wider entrance view stays indoors.
  const depth = Math.max(20, view + 7, Math.max(leftCount, rightCount) * 3.8 + 6);
  const slots: Slot[] = [];
  for (let i = 0; i < backCount; i++) {
    const row = Math.floor(i / cols), col = i % cols;
    const inRow = Math.min(cols, backCount - row * cols);
    slots.push({ index: slots.length, row, col, wall: "back", rotation: 0,
      center: [(col - (inRow - 1) / 2) * HALL.bayW, 2.65 + (rows - row - 1) * HALL.levelH, -depth / 2 + 0.04] });
  }
  for (const [wall, amount, sign] of [["left", leftCount, -1], ["right", rightCount, 1]] as const) {
    for (let i = 0; i < amount; i++) {
      slots.push({ index: slots.length, row: 0, col: i, wall, rotation: -sign * Math.PI / 2,
        center: [sign * (width / 2 - 0.04), 2.65, -depth / 2 + 3.6 + i * 3.8] });
    }
  }
  return { cols, rows, arcadeW, arcadeH, width, depth, springY, slots };
}

/** Reserve upper-wall frames without redistributing the live collection below. */
export function withUpperShowcases(base: RoomPlan): RoomPlan {
  const springY = base.springY + 1.2;
  const y = 4.85 + (base.rows - 1) * HALL.levelH + 2.25;
  const sides = base.slots.filter(s => s.wall !== "back");
  const upper = sides.map(s => ({ ...s, index: 0, upper: true, center: [s.center[0], y, s.center[2]] as Vec3 }));
  const windowR = Math.min(3.3, base.width * 0.3);
  for (const sign of [-1, 1]) upper.push({
    index: 0, row: 0, col: sign < 0 ? 0 : 1, wall: "back", rotation: 0, upper: true,
    center: [sign * (base.width / 2 + windowR) / 2, y - 0.45, -base.depth / 2 + 0.04],
  });
  upper.forEach((slot, i) => { slot.index = base.slots.length + i; });
  return { ...base, springY, slots: [...base.slots, ...upper] };
}

/** Follow the perimeter from the entrance's left side to its right side. */
export function galleryNavigationOrder(plan: RoomPlan): number[] {
  const left = plan.slots.filter(slot => slot.wall === "left").sort((a, b) => b.center[2] - a.center[2]);
  const back = plan.slots.filter(slot => slot.wall === "back").sort((a, b) => a.row - b.row || a.center[0] - b.center[0]);
  const right = plan.slots.filter(slot => slot.wall === "right").sort((a, b) => a.center[2] - b.center[2]);
  return [false, true].flatMap(upper => [...left, ...back, ...right].filter(slot => !!slot.upper === upper).map(slot => slot.index));
}

/** Resolve from the most recently requested target, including during an interrupted walk. */
export function adjacentGalleryIndex(order: number[], current: number, direction: -1 | 1): number {
  const position = order.indexOf(current);
  if (position < 0) return current;
  return order[Math.max(0, Math.min(order.length - 1, position + direction))];
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

/** Stand far enough back to show the side walls and the skylight. */
export function overviewPose(plan: RoomPlan, aspect: number): Pose {
  const d = Math.max(overviewDistance(plan.arcadeW, plan.arcadeH, aspect), plan.depth * 0.9);
  // Look at a point a little above the arcade's middle, from standing height, so
  // the view takes in the floor, the arcade and the start of the vault.
  const cy = Math.min(plan.springY * 0.52, 4.4 + (plan.rows - 1) * 1.5 + (plan.slots.some(s => s.upper) ? 0.65 : 0));
  const y = HALL.eye + 0.25;
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
  const distance = Math.min(d, slot.wall === "back" ? plan.depth - 1 : plan.width - 1);
  return { pos: [cx + Math.sin(slot.rotation) * distance, cy - h * 0.3, cz + Math.cos(slot.rotation) * distance], yaw: -slot.rotation, pitch: 0 };
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
