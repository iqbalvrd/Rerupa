/**
 * Sheva's gilded frame (frame-ornament.tsx + framed-art.module.css) drawn onto
 * a canvas, so the 3D hall hangs the same frame as the artwork page: mitred
 * rails with the moulded profile and wood grain, a row of beading, a thin gold
 * slip around the picture, and the carved corner scrolls and centre crowns
 * from the same SVG paths. The opening is left transparent; the painting is a
 * separate plane behind it.
 */
import * as THREE from "three";
import {
  CENTER_ENGRAVING,
  CENTER_LEAF,
  CENTER_SCROLL,
  CENTER_SHINE,
  CORNER_ENGRAVING,
  CORNER_LEAF,
  CORNER_SCROLL,
  CORNER_SHINE,
  GILDING,
} from "../frame-ornament";

/** The rail's moulded profile, outer edge (0) to inner edge (1), from framed-art.module.css. */
const PROFILE: [number, string][] = [
  [0, "#51351b"],
  [0.04, "#bd934c"],
  [0.08, "#efd49c"],
  [0.11, "#9d7137"],
  [0.16, "#704b25"],
  [0.2, "#bd9556"],
  [0.29, "#dfbd7e"],
  [0.38, "#b78b4b"],
  [0.51, "#a87b3e"],
  [0.65, "#dfbd7b"],
  [0.7, "#f0d598"],
  [0.77, "#90612d"],
  [0.84, "#64421e"],
  [0.9, "#d8b473"],
  [0.95, "#e7c78b"],
  [1, "#573818"],
];

const PX_PER_M = 520;
const MAX_PX = 2048;

/**
 * Frame for a `w` × `h` m painting with a `fw` m wide frame. The texture covers
 * (w + 2·fw) × (h + 2·fw); its plane goes in front of the painting.
 */
export function frameTexture(w: number, h: number, fw: number): THREE.CanvasTexture {
  const ow = w + 2 * fw;
  const oh = h + 2 * fw;
  const scale = Math.min(PX_PER_M, MAX_PX / Math.max(ow, oh));
  const W = Math.round(ow * scale);
  const H = Math.round(oh * scale);
  const F = fw * scale;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;

  // Rails: each side is a mitred trapezoid, profile running outer → inner.
  const sides: { poly: [number, number][]; from: [number, number]; to: [number, number]; along: "x" | "y" }[] = [
    { poly: [[0, 0], [W, 0], [W - F, F], [F, F]], from: [0, 0], to: [0, F], along: "x" },
    { poly: [[0, H], [W, H], [W - F, H - F], [F, H - F]], from: [0, H], to: [0, H - F], along: "x" },
    { poly: [[0, 0], [F, F], [F, H - F], [0, H]], from: [0, 0], to: [F, 0], along: "y" },
    { poly: [[W, 0], [W - F, F], [W - F, H - F], [W, H]], from: [W, 0], to: [W - F, 0], along: "y" },
  ];
  for (const side of sides) {
    g.save();
    g.beginPath();
    side.poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.clip();
    const grad = g.createLinearGradient(...side.from, ...side.to);
    for (const [o, c] of PROFILE) grad.addColorStop(o, c);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // Wood grain along the rail.
    const pitch = Math.max(2, F / 22);
    g.fillStyle = "rgba(75, 46, 18, 0.1)";
    if (side.along === "x") for (let y = 0; y < H; y += pitch) g.fillRect(0, y, W, pitch * 0.3);
    else for (let x = 0; x < W; x += pitch) g.fillRect(x, 0, pitch * 0.3, H);
    // Beading: a row of small gilt beads at 11–18% in from the outer edge.
    const r = F * 0.035;
    const step = r * 2.6;
    const inset = F * 0.145;
    const bead = (x: number, y: number) => {
      const b = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
      b.addColorStop(0, "#f4d69c");
      b.addColorStop(0.55, "#ab7737");
      b.addColorStop(1, "#573b1e");
      g.fillStyle = b;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    };
    if (side.along === "x") {
      const y = side.from[1] === 0 ? inset : H - inset;
      for (let x = step / 2; x < W; x += step) bead(x, y);
    } else {
      const x = side.from[0] === 0 ? inset : W - inset;
      for (let y = step / 2; y < H; y += step) bead(x, y);
    }
    g.restore();
  }

  // Opening: transparent, the painting shows through.
  g.clearRect(F, F, W - 2 * F, H - 2 * F);

  // Gold slip and dark line just outside the picture (a box-shadow in CSS).
  const slip = Math.max(2, F * 0.035);
  g.strokeStyle = "#dcba69";
  g.lineWidth = slip;
  g.strokeRect(F - slip / 2 - 1, F - slip / 2 - 1, W - 2 * F + slip + 2, H - 2 * F + slip + 2);
  g.strokeStyle = "#362207";
  g.lineWidth = 1.5;
  g.strokeRect(F - 0.75, F - 0.75, W - 2 * F + 1.5, H - 2 * F + 1.5);

  // Carved ornaments, as positioned in framed-art.module.css.
  const corner = F * 1.42;
  const crownW = F * 2.32;
  const crownH = F * 0.96;
  const ornament = (cx: number, cy: number, angle: number, isCorner: boolean) => {
    const box = isCorner ? 102 : 140;
    const size = isCorner ? corner : crownW;
    const k = size / box;
    const vh = isCorner ? 102 : 58;
    g.save();
    g.translate(cx, cy);
    g.rotate(angle);
    g.scale(k, k);
    g.translate(-box / 2, -vh / 2);
    const fill = g.createLinearGradient(0, 0, box * 0.7, vh);
    for (const [o, c] of GILDING) fill.addColorStop(o, c);
    g.shadowColor = "rgba(60, 37, 12, 0.6)";
    g.shadowOffsetX = 1 / k;
    g.shadowOffsetY = 2 / k;
    g.shadowBlur = 2 / k;
    for (const d of isCorner ? [CORNER_SCROLL, CORNER_LEAF] : [CENTER_SCROLL, CENTER_LEAF]) {
      const p = new Path2D(d);
      g.fillStyle = fill;
      g.fill(p);
      g.shadowColor = "transparent";
      g.lineJoin = "round";
      g.strokeStyle = "#67421f";
      g.lineWidth = 3.1;
      g.stroke(p);
      g.save();
      g.translate(-0.7, -1);
      g.strokeStyle = "#f6d992";
      g.lineWidth = 1.1;
      g.stroke(p);
      g.restore();
    }
    g.lineCap = "round";
    g.strokeStyle = "#765024";
    g.lineWidth = 2.5;
    g.stroke(new Path2D(isCorner ? CORNER_ENGRAVING : CENTER_ENGRAVING));
    g.strokeStyle = isCorner ? "#f3d28b" : "#f7d993";
    g.lineWidth = isCorner ? 1.3 : 1.2;
    g.stroke(new Path2D(isCorner ? CORNER_SHINE : CENTER_SHINE));
    if (isCorner) {
      g.beginPath();
      g.arc(13, 13, 5.7, 0, Math.PI * 2);
      g.fillStyle = fill;
      g.fill();
      g.strokeStyle = "#855b2a";
      g.lineWidth = 1.2;
      g.stroke();
    }
    g.restore();
  };
  const c = corner / 2 - 2;
  ornament(c, c, 0, true);
  ornament(W - c, c, Math.PI / 2, true);
  ornament(W - c, H - c, Math.PI, true);
  ornament(c, H - c, (3 * Math.PI) / 2, true);
  ornament(W / 2, crownH / 2 - 1, 0, false);
  ornament(W / 2, H - crownH / 2 + 1, Math.PI, false);
  ornament(F * 0.46, H / 2, -Math.PI / 2, false);
  ornament(W - F * 0.46, H / 2, Math.PI / 2, false);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
