import * as THREE from "three";

/** A single stone mosaic sheet keeps the border and central rosette in one draw call. */
export function floorInlayTexture(width: number, length: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.min(2048, Math.round(1024 * length / width));
  const ctx = canvas.getContext("2d")!;
  ctx.scale(canvas.width / width, canvas.height / length);
  ctx.fillStyle = "#c9bda5";
  ctx.fillRect(0, 0, width, length);
  let seed = 93;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const tile = 1.2;
  for (let y = 0; y < length; y += tile) for (let x = 0; x < width; x += tile) {
    const shade = Math.round(random() * 12);
    ctx.fillStyle = `rgb(${201 + shade},${191 + shade},${173 + shade})`;
    ctx.fillRect(x + 0.008, y + 0.008, tile - 0.016, tile - 0.016);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, tile, tile); ctx.clip();
    for (let i = 0; i < 5; i++) {
      const vy = y + random() * tile;
      ctx.strokeStyle = i % 2 ? "#fff4db25" : "#82735f18";
      ctx.lineWidth = 0.008 + random() * 0.012;
      ctx.beginPath(); ctx.moveTo(x, vy);
      ctx.bezierCurveTo(x + 0.4, vy - 0.15, x + 0.75, vy + 0.2, x + tile, vy - 0.1);
      ctx.stroke();
    }
    ctx.restore();
  }
  for (const [inset, weight, color] of [[0.65, 0.21, "#526052"], [0.82, 0.035, "#a17e4f"], [1.02, 0.035, "#a17e4f"]] as const) {
    ctx.lineWidth = weight; ctx.strokeStyle = color;
    ctx.strokeRect(inset, inset, width - inset * 2, length - inset * 2);
  }
  // Small brass and terracotta inserts punctuate the green stone perimeter.
  for (const x of [0.65, width - 0.65]) for (let y = 1.6; y < length - 1; y += 1.2) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#bfa373"; ctx.fillRect(-0.075, -0.075, 0.15, 0.15);
    ctx.restore();
  }
  ctx.save(); ctx.translate(width / 2, length * 0.34);
  for (const [radius, weight, color] of [[1.42, 0.12, "#526052"], [1.29, 0.025, "#a17e4f"], [0.99, 0.025, "#a17e4f"]] as const) {
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color; ctx.lineWidth = weight; ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    ctx.save(); ctx.rotate(i * Math.PI / 4);
    ctx.beginPath(); ctx.moveTo(0, -0.06);
    ctx.bezierCurveTo(-0.32, -0.35, -0.22, -0.72, 0, -0.93);
    ctx.bezierCurveTo(0.22, -0.72, 0.32, -0.35, 0, -0.06);
    ctx.fillStyle = i % 2 ? "#a47e5b" : "#64705e"; ctx.fill();
    ctx.strokeStyle = "#c4ab7d"; ctx.lineWidth = 0.018; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function carvedWoodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const wood = ctx.createLinearGradient(0, 0, 0, 128);
  wood.addColorStop(0, "#291c16");
  wood.addColorStop(0.44, "#513626");
  wood.addColorStop(1, "#302018");
  ctx.fillStyle = wood;
  ctx.fillRect(0, 0, 512, 128);
  for (let y = 4; y < 128; y += 3) {
    ctx.strokeStyle = y % 5 ? "#1f100e30" : "#ca996c28";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(145, y + 5, 360, y - 5, 512, y);
    ctx.stroke();
  }
  for (const y of [9, 15, 113, 119]) {
    ctx.fillStyle = y % 2 ? "#a78353" : "#382319";
    ctx.fillRect(0, y, 512, 2);
  }

  const petal = new Path2D("M 0 -5 C -23 -24 -15 -40 0 -39 C 15 -40 23 -24 0 -5 Z");
  for (let x = 64; x < 512; x += 128) {
    ctx.save();
    ctx.translate(x, 64);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = "#2c1d16";
      ctx.fill(petal);
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#241710";
      ctx.stroke(petal);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#b38654";
      ctx.stroke(petal);
      ctx.rotate(Math.PI / 2);
    }
    ctx.fillStyle = "#c09a62";
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** The front face of the bronze relief, with recessed lines and rubbed highlights. */
export function bronzeReliefTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const finish = ctx.createLinearGradient(20, 20, 350, 490);
  finish.addColorStop(0, "#b58a57");
  finish.addColorStop(0.32, "#806040");
  finish.addColorStop(0.62, "#584a37");
  finish.addColorStop(1, "#96704a");
  ctx.fillStyle = finish;
  ctx.fillRect(0, 0, 384, 512);
  let seed = 79;
  for (let i = 0; i < 3500; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const x = (seed >>> 16) % 384;
    const y = (seed >>> 6) % 512;
    ctx.fillStyle = seed & 1 ? "#c6a67c22" : "#293b322b";
    ctx.fillRect(x, y, 1 + (seed >>> 30), 1);
  }

  const tree = new Path2D("M192 474 C171 428 213 396 192 346 S180 278 192 238 S199 160 192 72");
  const leaf = new Path2D("M0 0 C5 -23 24 -35 46 -38 C42 -15 30 2 0 0 Z");
  const line = (path: Path2D, width = 1.8) => {
    ctx.lineWidth = width + 1;
    ctx.strokeStyle = "#342b23";
    ctx.stroke(path);
    ctx.save();
    ctx.translate(0, -1);
    ctx.lineWidth = width;
    ctx.strokeStyle = "#e1b57a";
    ctx.stroke(path);
    ctx.restore();
  };
  line(tree, 4);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(192, 0);
    ctx.scale(side, 1);
    line(new Path2D("M16 469 C60 452 151 436 161 371 C178 291 98 151 8 43"));
    for (let i = 0; i < 6; i++) {
      const y = 166 + i * 48;
      const reach = 30 + i * 9;
      line(new Path2D(`M0 ${y + 25} Q${reach * 0.65} ${y + 9} ${reach} ${y - 18}`));
      for (const [x, offset] of [[reach * 0.42, 3], [reach * 0.78, -13]]) {
        ctx.save();
        ctx.translate(x, y + offset);
        ctx.scale(0.5, 0.56);
        line(leaf);
        ctx.restore();
      }
    }
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A stylized leaf-shaped relief with an actual rounded bronze edge. */
export function centerpieceGeometry() {
  const outline = new THREE.Shape();
  outline.moveTo(-0.33, 0.035);
  outline.bezierCurveTo(-0.6, 0.16, -0.61, 0.49, -0.41, 0.81);
  outline.bezierCurveTo(-0.28, 1.02, -0.1, 1.25, 0, 1.44);
  outline.bezierCurveTo(0.1, 1.25, 0.28, 1.02, 0.41, 0.81);
  outline.bezierCurveTo(0.61, 0.49, 0.6, 0.16, 0.33, 0.035);
  outline.quadraticCurveTo(0, 0, -0.33, 0.035);
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: 0.08,
    bevelEnabled: true,
    bevelThickness: 0.024,
    bevelSize: 0.027,
    bevelSegments: 3,
    curveSegments: 14,
  });
  const vertices = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const caps = geometry.groups.find(group => group.materialIndex === 0);
  if (caps) {
    for (let i = caps.start; i < caps.start + caps.count; i++) {
      uv.setXY(i, 0.5 + vertices.getX(i) / 1.1, vertices.getY(i) / 1.47);
    }
  }
  geometry.translate(0, 0, -0.04);
  return geometry;
}

/** Decorative plaster panel inspired by petal and tendril carving. */
export function wallReliefTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ddd2b9";
  ctx.fillRect(0, 0, 512, 512);
  for (const inset of [12, 20, 34]) {
    ctx.strokeStyle = inset === 20 ? "#f1e4c5" : "#998368";
    ctx.lineWidth = inset === 20 ? 3 : 2;
    ctx.strokeRect(inset, inset, 512 - inset * 2, 512 - inset * 2);
  }
  const leaf = new Path2D("M0 0 C-58 -38 -48 -92 0 -140 C48 -92 58 -38 0 0 Z");
  ctx.translate(256, 256);
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.rotate(i * Math.PI / 4);
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#9c886d";
    ctx.stroke(leaf);
    ctx.translate(-1, -2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#f7e8c9";
    ctx.stroke(leaf);
    ctx.restore();
  }
  ctx.fillStyle = "#b39865";
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
