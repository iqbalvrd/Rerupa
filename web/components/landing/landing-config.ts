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
  horizon: "#eaa46e",
  skyMid: "#bf867c",
  skyTop: "#4d5d81",
  sunGlow: "#ffd18e",
  cloudLight: "#f0af8b",
  cloudShade: "#7b7486",
  hemiSky: "#e1d6e0",
  hemiGround: "#6f7f4c",
  sun: "#ffca98",
  wall: "#f7f1e6",
  trim: "#fffbf3",
  base: "#e3dbcd",
  door: "#5a3a22",
  /** Darker recess around each raised panel, and the panel face itself. */
  doorPanelShadow: "#4a2f1b",
  doorPanel: "#664229",
  doorKnob: "#d8b26a",
  /** Fanlight glass: warm, lit from inside. */
  fanlight: "#fff1d3",
  doorLight: "#fff4dc",
  doorLamp: "#ffcd8c",
  road: "#ece2d1",
  roadEdge: "#d2c6b2",
  ground: "#55733d",
  lampPost: "#2f2a26",
  lampBulb: "#fff0cf",
  bird: "#2e2433",
} as const;

export const FOG = { near: 90, far: 260 } as const;

export const SKY = {
  radius: 500,
  sunDir: [-0.60, 0.145, -1] as Vec3,
} as const;

export const LIGHTS = {
  hemiIntensity: 0.82,
  sunIntensity: 2.18,
  sunPosition: [-28, 34, 30] as Vec3,
  shadowMapSize: 2048,
  shadowCamera: { left: -70, right: 70, top: 45, bottom: -45, near: 1, far: 180 },
  shadowBias: -0.0005,
  shadowNormalBias: 0.04,
  shadowRadius: 3,
} as const;

export const MUSEUM = {
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
  leafDepth: 0.22,
  /** Positive: the leaves swing in, into the lit passage cut behind the doorway (no clipping). */
  openAngle: 1.3,
  lampIdle: 19,
  lampPulse: 34,
  pulseSeconds: 4.6,
  lampOpen: 76,
  glowWidth: 5.5,
  glowHeight: 8.8,
  spillWidth: 6.0,
  spillDepth: 6.9,
} as const;

/**
 * The doorway is a real opening: the portico wall and the building body are
 * cut around it and a lit passage runs behind it, so the leaves can swing
 * inward and the camera can walk in.
 */
export const DOORWAY = {
  /** Half width of the opening and the passage (leaves are 2 m each; a little room for their thickness). */
  halfWidth: 2.15,
  /** Floor of the passage, just above the steps. */
  floorY: 1.3,
  /** Top of the opening: the underside of the lintel. */
  topY: 8.47,
  /** How deep the passage runs into the building. */
  depth: 10,
} as const;

/** Neoclassical door details (all in metres). */
export const DOOR_STYLE = {
  /** Architrave: side jambs and head casing around the opening. */
  jambWidth: 0.42,
  jambDepth: 0.32,
  /** Raised panels per leaf, top to bottom: [height, y offset from leaf centre]. */
  panels: [
    [2.9, 1.65],
    [0.9, -0.55],
    [2.2, -2.2],
  ] as const,
  panelInset: 0.28,
  /** Semicircular fanlight above the lintel. */
  fanlightRadius: 1.55,
  fanlightY: 9.1,
  /** Cornice hood above the fanlight. */
  hoodY: 10.95,
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
  // The model faces +X and its foot contact is at the GLB origin.
  figureUrl: "/models/rerupa-gajah.glb",
  pedestalTop: 3.75,
  figureRotationY: -0.55,
} as const;

export const GRASS = {
  count: 68_000,
  countLowEnd: 34_000,
  bladeHeight: 0.44,
  areaHalfX: 35,
  zFrom: 20,
  zDepth: 48,
  nearHalfX: 16,
  nearDepth: 36,
  statueClearance: 3.6,
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
    [-52, -44, 2.1, "CommonTree_1"],
    [56, -46, 2.2, "CommonTree_3"],
    [-16, -6, 1.1, "CommonTree_1"],
    [19, 6, 1.0, "CommonTree_3"],
    [-22, 10, 1.2, "CommonTree_1"],
    [-64, -18, 2.3, "CommonTree_3"],
    [66, -16, 2.2, "CommonTree_1"],
  ] as const,
  featureTrees: [
    { x: 26, z: -31, height: 12.3, seed: 479, flower: "#d4a0c8" },
    { x: 36, z: -37, height: 11.9, seed: 641, flower: "#c789b1" },
  ],
  hedge: { from: -46, to: 46, step: 4.4, skipInside: 19, z: MZ + 1.6, flowering: 0.35, scaleMin: 1.3, scaleRange: 0.4 },
  flowerBeds: [
    { x: -4.5, z: 9, petal: "#ecce73", count: 9, height: 0.77 },
    { x: 4.8, z: 4, petal: "#d68d97", count: 11, height: 0.80 },
    { x: 6.1, z: 5.7, petal: "#edc7a1", count: 8, height: 0.63 },
    { x: 6.7, z: 1, petal: "#bb9bd4", count: 7, height: 0.59 },
    { x: -5.5, z: -3, petal: "#e5c77d", count: 7, height: 0.67 },
    { x: 3.8, z: -16, petal: "#d2aed5", count: 7, height: 0.73 },
    { x: -4.2, z: -21, petal: "#edca91", count: 7, height: 0.67 },
    { x: 4.2, z: 13, petal: "#e0a7b8", count: 7, height: 0.65 },
    { x: -6, z: 15, petal: "#dba5b6", count: 6, height: 0.65 },
  ],
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
    [0, 2.7, MZ + 15],
    // Stop just outside the columns (MZ + 7.4), about 10 m from the door: the whole
    // doorway stays in view while the leaves swing open toward the visitor.
    [0, 3.3, MZ + 11],
  ] as Vec3[],
  lookStart: [2.5, 6.4, -22] as Vec3,
  lookStartPortrait: [1.2, 6.4, -22] as Vec3,
  lookDoor: [0, DOOR.y, DZ] as Vec3,
  /** After the doors open, the camera walks through the doorway to this point inside the lit passage. */
  enterTo: [0, 4.3, MZ - 4] as Vec3,
  /** And looks down the passage. */
  lookInside: [0, 4.3, MZ - 9] as Vec3,
  near: 0.1,
  far: 800,
  /** FOV by aspect: < 0.8 → portrait, < 1.2 → square-ish, else landscape. */
  fov: { landscape: 50, square: 60, portrait: 72 },
  portraitAspect: 0.8,
  squareAspect: 1.2,
} as const;

/**
 * Entry timeline, as fractions of `duration`:
 * walk to the steps → stop in front of the door → the leaves swing open, fully
 * visible → the doorway floods with white light → the gallery fades in from white.
 */
export const TRAVEL = {
  duration: 7.4,
  /** Camera walks the curve, then stops in front of the door. */
  walk: [0, 0.48] as const,
  /** Look target slides from the statue to the door. */
  look: [0.06, 0.44] as const,
  /** Door opens inward while the camera stands still. */
  doorOpen: [0.48, 0.66] as const,
  /** Camera walks through the doorway into the light. */
  walkIn: [0.66, 0.98] as const,
  /** White light fills the screen as the camera enters. */
  white: [0.76, 0.98] as const,
  /** White fade into the gallery (s). */
  fadeOut: 0.6,
} as const;

/** Safety net: the enter button unlocks even if a model never loads. */
export const LOAD_TIMEOUT_MS = 15_000;

export const SEEN_KEY = "rerupa:landing-seen";
