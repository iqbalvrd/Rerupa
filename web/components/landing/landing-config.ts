/**
 * Every tuning number of the landing scene (LANDING_SPEC.md §4, §5.2).
 * Units are meters. x right, y up, z toward the camera; the museum is at -z.
 * Values are ported 1:1 from docs/landing/landing_prototype_v3.html.
 */

export type Vec3 = readonly [number, number, number];

/** Front of the museum wings. */
export const MZ = -40;
/** Door plane. */
export const DZ = MZ + 1.06;

export const RENDERER = {
  exposure: 0.95,
  maxDpr: 1.5,
  envIntensity: 0.35,
  envBlur: 0.04,
} as const;

export const COLORS = {
  horizon: "#f4c6a0",
  skyMid: "#d08aa6",
  skyTop: "#433c78",
  sunGlow: [1.0, 0.82, 0.6] as Vec3,
  hemiSky: "#ffdcec",
  hemiGround: "#6f7f4c",
  sun: "#ffd6ac",
  wall: "#f7f1e6",
  trim: "#fffbf3",
  base: "#e3dbcd",
  roof: "#d8d1c6",
  glass: "#37445a",
  windowFrame: "#ece4d6",
  door: "#5a3a22",
  doorKnob: "#d8b26a",
  doorLight: "#fff4dc",
  doorLamp: "#ffd9a0",
  steps: "#e9e2d6",
  tympanum: "#eee7db",
  bronze: "#7d5631",
  road: "#ece2d1",
  roadEdge: "#d2c6b2",
  ground: "#6a9149",
  lampPost: "#2f2a26",
  lampBulb: "#fff0cf",
  cloud: "255,236,232",
  bird: "#2e2433",
} as const;

export const FOG = { near: 90, far: 260 } as const;

export const SKY = {
  radius: 500,
  sunDir: [-0.45, 0.12, -1] as Vec3,
  cloudOpacity: 0.55,
  /** [x, y, z, size] */
  clouds: [
    [-120, 70, -300, 120],
    [60, 95, -320, 150],
    [200, 60, -260, 110],
    [-40, 120, -380, 170],
  ] as const,
  cloudWrapX: 300,
} as const;

export const LIGHTS = {
  hemiIntensity: 0.9,
  sunIntensity: 2.6,
  sunPosition: [-28, 34, 30] as Vec3,
  shadowMapSize: 2048,
  shadowCamera: { left: -70, right: 70, top: 45, bottom: -45, near: 1, far: 180 },
  shadowBias: -0.0005,
  shadowNormalBias: 0.04,
  shadowRadius: 3,
} as const;

export const MUSEUM = {
  windowSpacing: 6.2,
  /** Window bays from -7..7, skipping |i| < 3 (the portico). */
  windowRange: 7,
  windowSkip: 3,
  /** [width, depth, z] for the three steps, bottom first. */
  steps: [
    [36, 11, MZ + 5.5],
    [33, 9, MZ + 5],
    [30, 7, MZ + 4.5],
  ] as const,
  stepHeight: 0.42,
  columnsX: [-11, -7.3, -3.6, 3.6, 7.3, 11] as const,
  columnZ: MZ + 7.4,
  lampX: 17,
  lampZ: MZ + 12,
} as const;

export const DOOR = {
  y: 4.95,
  leafWidth: 2,
  leafHeight: 7,
  openAngle: 1.35,
  lampIntensity: 40,
  glowScale: 9,
  glowGrow: 14,
} as const;

export const PATH = {
  points: [
    [1, 0, 18],
    [-2.2, 0, 2],
    [0.8, 0, -12],
    [0, 0, -24],
    [0, 0, MZ + 11],
  ] as Vec3[],
  halfWidth: 2.5,
  edgeWidth: 0.4,
  segments: 180,
} as const;

export const STATUE = {
  desktop: [6.5, 0, -6.5] as Vec3,
  portrait: [3.6, 0, -6.5] as Vec3,
  figureRotationY: -0.55,
} as const;

export const GRASS = {
  count: 40_000,
  countLowEnd: 18_000,
  bladeHeight: 0.62,
  areaHalfX: 35,
  zFrom: 20,
  zDepth: 48,
  pathClearance: 3.3,
  statueClearance: 3.6,
  scaleMin: 0.55,
  scaleRange: 0.5,
  fadeNear: 40,
  fadeFar: 120,
} as const;

export const NATURE = {
  url: "/models/nature.glb",
  alphaTest: 0.4,
  /** [x, z, scale, model] */
  trees: [
    [-26, -30, 1.5, "CommonTree_1"],
    [-34, -36, 1.8, "CommonTree_3"],
    [26, -31, 1.6, "CommonTree_3"],
    [36, -37, 1.9, "CommonTree_1"],
    [-52, -44, 2.1, "CommonTree_1"],
    [56, -46, 2.2, "CommonTree_3"],
    [-16, -6, 1.1, "CommonTree_1"],
    [19, 6, 1.0, "CommonTree_3"],
    [-22, 10, 1.2, "CommonTree_1"],
    [-64, -18, 2.3, "CommonTree_3"],
    [66, -16, 2.2, "CommonTree_1"],
  ] as const,
  hedge: { from: -46, to: 46, step: 4.4, skipInside: 19, z: MZ + 1.6, flowering: 0.35, scaleMin: 1.3, scaleRange: 0.4 },
  flowers: [
    [-4.5, 9],
    [4.8, 4],
    [-5.5, -3],
    [3.2, -16],
    [-3.8, -21],
    [4.2, 13],
    [-6, 15],
  ] as const,
  flowerScale: 0.6,
  statueBushes: [
    [9.8, -4],
    [3.4, -9.6],
    [9.6, -9.4],
    [3.0, -3.6],
  ] as const,
  statueBushScale: 1.1,
} as const;

export const BIRDS = { count: 6, wrapX: 80 } as const;

export const CAMERA = {
  path: [
    [0.6, 0.8, 13],
    [-1.6, 1.2, 1],
    [0.6, 1.7, -10],
    [0, 2.1, -22],
    [0, 2.7, MZ + 14],
    [0, 3.8, MZ + 6.2],
  ] as Vec3[],
  lookStart: [2.5, 6.4, -22] as Vec3,
  lookStartPortrait: [1.2, 6.4, -22] as Vec3,
  lookDoor: [0, DOOR.y, DZ] as Vec3,
  near: 0.1,
  far: 800,
  /** FOV by aspect: < 0.8 → portrait, < 1.2 → square-ish, else landscape. */
  fov: { landscape: 50, square: 60, portrait: 72 },
  portraitAspect: 0.8,
  squareAspect: 1.2,
} as const;

/** Entry timeline, as fractions of `duration`. */
export const TRAVEL = {
  duration: 5.5,
  look: [0.12, 0.62] as const,
  doorOpen: [0.78, 0.93] as const,
  white: [0.9, 1] as const,
  /** White fade into the gallery (s). */
  fadeOut: 0.6,
} as const;

/** Safety net: the enter button unlocks even if the plants never load. */
export const LOAD_TIMEOUT_MS = 15_000;

export const SEEN_KEY = "rerupa:landing-seen";
