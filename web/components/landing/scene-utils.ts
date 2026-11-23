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

/** Warm bloom drawn around the aperture, strongest at the lower seam. */
export function entryGlowTexture() {
  return canvasTexture(64, 128, (g, w, h) => {
    const pixels = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w * 2 - 1;
        const v = (y + 0.5) / h;
        const shaft = 0.23 * Math.exp(-((u / 0.23) ** 2)) * Math.sin(Math.PI * v);
        const foot = 0.40 * Math.exp(-((u / 0.54) ** 4) - (((v - 0.86) / 0.11) ** 2));
        const bloom = 0.13 * Math.exp(-((u / 0.7) ** 2) - (((v - 0.64) / 0.41) ** 2));
        const edge = Math.min(1, (1 - Math.abs(u)) * 6, v * 12, (1 - v) * 12);
        pixels.data.set([255, 203, 130, Math.round(255 * (shaft + foot + bloom) * edge)], (y * w + x) * 4);
      }
    }
    g.putImageData(pixels, 0, 0);
  });
}

/** Soft pool which tapers as light travels outward across the porch. */
export function entrySpillTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    const pixels = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = Math.abs((x + 0.5) / w * 2 - 1);
        const v = (y + 0.5) / h;
        const spread = 0.38 + v * 0.48;
        const shape = Math.max(0, 1 - (u / spread) ** 2);
        const alpha = 0.58 * shape ** 2 * (1 - v) ** 2.1 * Math.min(1, v * 19);
        pixels.data.set([255, 187, 106, Math.round(alpha * 255)], (y * w + x) * 4);
      }
    }
    g.putImageData(pixels, 0, 0);
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

/** Repeatable scatter so the landscaping is stable across reloads and device tiers. */
export function seededRandom(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
