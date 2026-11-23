/**
 * Small builders shared by the landing scene parts, ported from the
 * prototype's `S`, `rbox` and `canvasTex` helpers.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { CAMERA, COLORS, PATH, TRAVEL, type Vec3 } from "./landing-config";

/** Clean, solid material: colour + a little roughness (LANDING_SPEC §2, §4.4). */
export function solid(color: string, roughness = 0.85, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/** Rounded box that casts and receives shadow, added to `parent`. */
export function rbox(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  r = 0.08,
) {
  const radius = Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01);
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, radius), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Texture painted on a 2D canvas (sRGB). */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft radial glow used for the door and its hover state. */
export function glowTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, "rgba(255,236,190,0.85)");
    r.addColorStop(1, "rgba(255,236,190,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  });
}

const v = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);

let roadCurve: THREE.CatmullRomCurve3 | null = null;
/** The stone path from the camera to the steps (shared by Path and Grass). */
export function getRoadCurve() {
  roadCurve ??= new THREE.CatmullRomCurve3(PATH.points.map(v));
  return roadCurve;
}

let cameraCurve: THREE.CatmullRomCurve3 | null = null;
export function getCameraCurve() {
  cameraCurve ??= new THREE.CatmullRomCurve3(CAMERA.path.map(v));
  return cameraCurve;
}

/** Hermite smoothstep of x between a and b. */
export function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** How far the doors are open (0–1) at travel progress p. */
export function doorOpenAt(p: number) {
  return smooth(TRAVEL.doorOpen[0], TRAVEL.doorOpen[1], p);
}

export const horizonColor = () => new THREE.Color(COLORS.horizon);

/** Dispose every geometry and material under `root` (textures are disposed by their owners). */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) m.dispose();
  });
}
