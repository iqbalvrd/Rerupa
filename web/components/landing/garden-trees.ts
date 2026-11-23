import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { gardenBatch, taperedStem, type GardenInstance } from "./garden-mesh";
import { canvasTexture, seededRandom } from "./scene-utils";

export type BlossomPoint = { position: THREE.Vector3; size: number; color: string };

const LEAF_COLORS = [
  ["#304624", "#628044", "#9baa64"],
  ["#384f29", "#6f8649", "#a6ae6a"],
  ["#3d552c", "#779250", "#aeb36c"],
] as const;

/** Small painted sprays have pointed, translucent leaves and visible midribs. */
function leafSpray() {
  return canvasTexture(256, 256, (ctx) => {
    const rng = seededRandom(281);
    ctx.lineCap = "round";
    ctx.strokeStyle = "#697043";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(112, 251);
    ctx.quadraticCurveTo(124, 133, 154, 32);
    ctx.stroke();

    function leaf(x: number, y: number, angle: number, length: number, halfWidth: number) {
      const [dark, middle, light] = LEAF_COLORS[Math.floor(rng() * LEAF_COLORS.length)];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      const gradient = ctx.createLinearGradient(0, -halfWidth, length * 0.74, halfWidth);
      gradient.addColorStop(0, dark);
      gradient.addColorStop(0.52, middle);
      gradient.addColorStop(1, light);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(length * 0.31, -halfWidth * 1.16, length * 0.69, -halfWidth, length, 0);
      ctx.bezierCurveTo(length * 0.63, halfWidth * 1.25, length * 0.29, halfWidth, 0, 0);
      ctx.fill();
      ctx.strokeStyle = "#d0ca8f86";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(1, 0);
      ctx.quadraticCurveTo(length * 0.5, -halfWidth * 0.12, length * 0.91, 0);
      ctx.stroke();
      ctx.lineWidth = 0.65;
      for (let k = 1; k < 5; k++) {
        const at = k / 6;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(length * at, 0);
          ctx.lineTo(length * (at + 0.15), side * halfWidth * Math.sin(at * Math.PI) * 0.64);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    for (let i = 0; i < 7; i++) {
      const y = 228 - i * 29;
      const x = 115 + i * 5;
      leaf(x, y, -2.42 - rng() * 0.26, 69 + rng() * 30, 10 + rng() * 7);
      leaf(x, y - 9, -0.53 - rng() * 0.34, 69 + rng() * 27, 10 + rng() * 7);
    }
    leaf(148, 60, -1.4, 50, 10);
    leaf(110, 168, -2.9, 62, 11);
    leaf(138, 118, -0.3, 67, 13);
  });
}

type Tree = { x: number; z: number; height: number; seed: number; flower: string };

/** Trees are made of individually bent boughs and overlapping elliptical sprays. */
export function buildFeatureTrees(trees: readonly Tree[]) {
  const wood: THREE.BufferGeometry[] = [];
  const leaves: GardenInstance[] = [];
  const blooms: BlossomPoint[] = [];
  const color = new THREE.Color("#775844");
  const euler = new THREE.Euler();
  const shade = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);

  for (const tree of trees) {
    const rng = seededRandom(tree.seed);
    const origin = new THREE.Vector3(tree.x, 0, tree.z);
    const h = tree.height;
    const w = h * (0.235 + rng() * 0.025);
    const lift = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).add(origin);
    const trunk = [
      lift(0, -0.09, 0), lift(-0.09, h * 0.14, 0.12), lift(0.13, h * 0.34, 0.21),
      lift(-0.16, h * 0.54, -0.03), lift(-0.42, h * 0.72, -0.08), lift(-0.64, h * 0.91, 0.08),
    ];
    wood.push(taperedStem(trunk, [0.53, 0.36, 0.3, 0.23, 0.12, 0.026], 14, color, 0.31));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rng() * 0.55;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      wood.push(taperedStem([
        lift(dx * 0.12, 0.47, dz * 0.12), lift(dx * 0.43, 0.17, dz * 0.43),
        lift(dx * (0.76 + rng() * 0.55), -0.06, dz * (0.75 + rng() * 0.45)),
      ], [0.16, 0.13, 0.025], 7, color, 0.24));
    }

    const spine = new THREE.CatmullRomCurve3(trunk);
    for (let i = 0; i < 12; i++) {
      const level = i / 11;
      const angle = i * 2.4 + rng() * 0.82;
      const spread = w * (1.08 - level * 0.61) * (0.85 + rng() * 0.27);
      const lateral = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const cross = new THREE.Vector3(-lateral.z, 0, lateral.x);
      const start = spine.getPoint(0.34 + level * 0.58);
      const middle = start.clone().addScaledVector(lateral, spread * 0.38).addScaledVector(up, h * 0.07);
      const edge = start.clone().addScaledVector(lateral, spread).addScaledVector(up, h * (0.15 + rng() * 0.035));
      wood.push(taperedStem([start, middle, edge], [0.28 - level * 0.18, 0.13 - level * 0.07, 0.032], 9, color, 0.18));

      for (let fork = -1; fork <= 1; fork++) {
        const tip = edge.clone().addScaledVector(cross, fork * (0.85 + rng() * 0.48))
          .addScaledVector(lateral, rng() * 0.42 - 0.15)
          .addScaledVector(up, 0.48 + rng() * 0.82 + (fork === 0 ? 0.18 : 0));
        wood.push(taperedStem([middle.clone().lerp(edge, 0.47), edge.clone().lerp(tip, 0.31), tip],
          [0.092, 0.061, 0.012], 6, color, 0.12));

        const spreadSize = 1.12 + rng() * 0.48;
        for (let j = 0; j < 25; j++) {
          const azimuth = rng() * Math.PI * 2;
          const y = rng() * 2 - 1;
          const radius = Math.cbrt(rng()) * spreadSize;
          const flat = Math.sqrt(1 - y * y);
          const position = tip.clone().add(new THREE.Vector3(
            Math.cos(azimuth) * radius * flat,
            y * radius * 0.69,
            Math.sin(azimuth) * radius * flat,
          ));
          const size = 0.50 + rng() * 0.67;
          leaves.push({
            position,
            rotation: new THREE.Quaternion().setFromEuler(euler.set(-0.4 + rng() * 0.85, azimuth, rng() * 2.5 - 1.25)),
            scale: new THREE.Vector3(size, size * (0.79 + rng() * 0.37), 1),
            color: shade.setRGB(0.69 + rng() * 0.30, 0.71 + rng() * 0.27, 0.55 + rng() * 0.35).clone(),
          });
        }

        if ((i + fork + tree.seed) % 3 === 0) {
          const spray = tip.clone().addScaledVector(lateral, 0.45).addScaledVector(up, 0.42);
          for (let j = 0; j < 6; j++) {
            const a = j * 2.4;
            const r = 0.08 + 0.12 * Math.sqrt(j);
            blooms.push({
              position: spray.clone().add(new THREE.Vector3(Math.cos(a) * r, rng() * 0.24, Math.sin(a) * r + 0.25)),
              size: 0.16 + rng() * 0.115,
              color: tree.flower,
            });
          }
        }
      }
    }
  }

  const group = new THREE.Group();
  const bark = new THREE.Mesh(mergeGeometries(wood), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.96,
  }));
  wood.forEach((geometry) => geometry.dispose());
  bark.castShadow = true;
  bark.receiveShadow = true;
  group.add(bark);

  const texture = leafSpray();
  texture.anisotropy = 4;
  const leafMaterial = new THREE.MeshStandardMaterial({
    map: texture, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95,
  });
  const foliage = gardenBatch(new THREE.PlaneGeometry(), leafMaterial, leaves);
  foliage.castShadow = true;
  group.add(foliage);
  return { group, texture, blooms };
}
