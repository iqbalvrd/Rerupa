import * as THREE from "three";

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
