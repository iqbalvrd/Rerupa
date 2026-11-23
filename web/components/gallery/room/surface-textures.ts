import * as THREE from "three";

type Surface = "plaster" | "stone" | "oak";

/** Small, deterministic textures: no photo downloads, and no visible random changes on navigation. */
export function surfaceTextures(kind: Surface) {
  const size = kind === "plaster" ? 256 : 512;
  const color = document.createElement("canvas");
  const relief = document.createElement("canvas");
  color.width = color.height = relief.width = relief.height = size;
  const ctx = color.getContext("2d")!, bumpCtx = relief.getContext("2d")!;
  const pixels = ctx.createImageData(size, size), heights = bumpCtx.createImageData(size, size);
  let seed = 71;
  const base = kind === "oak" ? [151, 107, 65] : kind === "stone" ? [201, 192, 175] : [246, 243, 235];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = (seed % 1024) / 1024 - 0.5;
    const u = x / size, v = y / size;
    const cloud = Math.sin(u * Math.PI * 6) * Math.cos(v * Math.PI * 4);
    let shade = cloud * 1.5 + noise * 3;
    let height = 128 + noise * 25;
    if (kind === "stone") {
      const vein = Math.pow(Math.max(0, Math.cos((u + v * 0.45) * 30 + Math.sin(v * 18))), 18);
      const tile = (x < size / 2 ? 0 : 1) + (y < size / 2 ? 0 : 2);
      const joint = x % (size / 2) < 2 || y % (size / 2) < 2;
      shade += [0, -4, 3, -2][tile] - vein * 5 - (joint ? 20 : 0);
      height -= joint ? 70 : vein * 5;
    } else if (kind === "oak") {
      const grain = Math.sin(v * Math.PI * 150 + Math.sin(u * Math.PI * 4) * 1.3 + Math.sin(v * 20));
      shade = grain * 5 + cloud * 3 + noise * 3;
      height = 128 + grain * 16 + noise * 8;
    }
    const i = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) { pixels.data[i + c] = base[c] + shade; heights.data[i + c] = height; }
    pixels.data[i + 3] = heights.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0); bumpCtx.putImageData(heights, 0, 0);
  const texture = (canvas: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  return { map: texture(color, true), bumpMap: texture(relief, false) };
}

/** Fade to transparent on every edge, so soft lighting never leaves a rectangular seam. */
export function softDiscTexture(color: string) {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
