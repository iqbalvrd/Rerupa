import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { gardenBatch, taperedStem, type GardenInstance } from "./garden-mesh";
import { seededRandom } from "./scene-utils";
import type { BlossomPoint } from "./garden-trees";

const UP = new THREE.Vector3(0, 1, 0);
const STEM = new THREE.Color("#48613b");

type FlowerBed = {
  x: number;
  z: number;
  petal: string;
  count: number;
  height: number;
};

function corolla() {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 2 / 5;
    const base = positions.length / 3;
    const rings = [
      [0.12, 0, 0.04], [0.38, 0.04, 0.21], [0.72, 0.16, 0.34],
      [0.95, 0.29, 0.20], [1.03 + (i % 2) * 0.05, 0.31, 0.025],
    ];
    rings.forEach(([r, y, width], j) => {
      for (const side of [-1, 0, 1]) {
        const across = side * width;
        positions.push(
          Math.cos(angle) * r - Math.sin(angle) * across,
          y + Math.abs(side) * width * 0.32,
          Math.sin(angle) * r + Math.cos(angle) * across,
        );
        const light = (0.62 + j * 0.09) * (side === 0 ? 1 : 0.9);
        colors.push(light, light, light);
      }
      if (j === rings.length - 1) return;
      for (let side = 0; side < 2; side++) {
        const a = base + j * 3 + side;
        indices.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
      }
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function flowerLeaf() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0,
    -0.21, 0.018, 0.26, 0, 0.091, 0.29, 0.22, 0.016, 0.25,
    -0.16, 0.07, 0.59, 0, 0.134, 0.65, 0.15, 0.055, 0.62,
    0.025, 0.115, 1,
  ], 3));
  geometry.setIndex([0, 2, 1, 0, 3, 2, 1, 2, 4, 2, 5, 4, 2, 3, 5, 3, 6, 5, 4, 5, 7, 5, 6, 7]);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildGardenFlowers(
  beds: readonly FlowerBed[],
  shrubs: readonly { x: number; z: number; scale: number }[],
  treeBlooms: BlossomPoint[],
) {
  const rng = seededRandom(974);
  const petals: GardenInstance[] = [];
  const centers: GardenInstance[] = [];
  const leaves: GardenInstance[] = [];
  const stems: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();

  function flower({ position, size, color }: BlossomPoint, tilt: THREE.Vector3) {
    const rotation = new THREE.Quaternion().setFromUnitVectors(UP, tilt.normalize())
      .multiply(new THREE.Quaternion().setFromAxisAngle(UP, rng() * Math.PI * 2));
    const tint = new THREE.Color(color).multiplyScalar(0.84 + rng() * 0.24);
    petals.push({ position, rotation, scale: new THREE.Vector3(size, size, size), color: tint });
    centers.push({
      position: position.clone().add(new THREE.Vector3(0, size * 0.17, 0).applyQuaternion(rotation)),
      rotation, scale: new THREE.Vector3(size * 0.23, size * 0.14, size * 0.23),
      color: new THREE.Color(rng() > 0.45 ? "#e4b552" : "#c99042"),
    });
  }

  for (const bed of beds) {
    for (let i = 0; i < bed.count; i++) {
      const angle = rng() * Math.PI * 2;
      const distance = Math.sqrt(rng()) * 0.69;
      const position = new THREE.Vector3(bed.x + Math.cos(angle) * distance, 0, bed.z + Math.sin(angle) * distance);
      const height = bed.height * (0.63 + rng() * 0.53);
      const tiltX = Math.cos(angle) * (0.055 + rng() * 0.13);
      const tiltZ = Math.sin(angle) * (0.052 + rng() * 0.13);
      const mid = position.clone().add(new THREE.Vector3(tiltX * 0.18, height * 0.55, tiltZ * 0.12));
      const tip = position.clone().add(new THREE.Vector3(tiltX, height, tiltZ));
      stems.push(taperedStem([position, mid, tip], [0.024, 0.017, 0.01], 5, STEM, 0.1));
      flower({ position: tip, size: 0.105 + rng() * 0.10, color: bed.petal },
        new THREE.Vector3(tiltX * 2, 0.55 + rng() * 0.42, 0.32 + rng() * 0.49));
      for (let j = 0; j < 3; j++) {
        const length = 0.21 + rng() * 0.19;
        const leafPitch = -0.25 - rng() * 0.31;
        leaves.push({
          position: position.clone().lerp(mid, 0.47 + j * 0.35),
          rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(leafPitch, angle + j * 2.31, 0)),
          scale: new THREE.Vector3(length * 0.79, length, length),
          color: new THREE.Color(j % 2 ? "#5f7c42" : "#405b31"),
        });
      }
    }
  }

  const shrubColors = ["#b58dc8", "#d2a8d7", "#e2abc1", "#e2c3dc"];
  shrubs.forEach(({ x, z, scale }, index) => {
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2;
      const radius = 0.42 + rng() * 0.41;
      const base = new THREE.Vector3(x + Math.cos(a) * radius * scale,
        (1.32 - radius * 0.38 + rng() * 0.07) * scale, z + Math.sin(a) * radius * scale);
      const root = base.clone().add(new THREE.Vector3(-Math.cos(a) * 0.24, -0.31 * scale, -Math.sin(a) * 0.24));
      stems.push(taperedStem([root, base], [0.017, 0.01], 5, STEM, 0.1));
      for (let petals = 0; petals < 3; petals++) {
        const point = base.clone().add(new THREE.Vector3((rng() - 0.5) * 0.25, 0.03 + rng() * 0.1, (rng() - 0.5) * 0.24));
        stems.push(taperedStem([base, point], [0.011, 0.006], 4, STEM, 0.1));
        flower({ position: point, size: 0.083 + rng() * 0.053, color: shrubColors[(index + i) % shrubColors.length] },
          new THREE.Vector3(Math.cos(a) * 0.45, 0.81, Math.sin(a) * 0.37));
      }
    }
  });
  for (const bloom of treeBlooms) {
    flower(bloom, new THREE.Vector3((rng() - 0.5) * 0.8, 0.62, 0.22 + rng() * 0.55));
  }

  const stemMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 });
  group.add(new THREE.Mesh(mergeGeometries(stems), stemMaterial));
  stems.forEach((geometry) => geometry.dispose());
  const softSurface = { side: THREE.DoubleSide, roughness: 0.86 } as const;
  group.add(
    gardenBatch(flowerLeaf(), new THREE.MeshStandardMaterial(softSurface), leaves),
    gardenBatch(corolla(), new THREE.MeshStandardMaterial({ ...softSurface, vertexColors: true }), petals),
    gardenBatch(new THREE.SphereGeometry(1, 8, 5), new THREE.MeshStandardMaterial({ roughness: 0.89 }), centers),
  );
  return group;
}
