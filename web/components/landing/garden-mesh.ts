import * as THREE from "three";

export type GardenInstance = {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  rotation: THREE.Quaternion;
  color: THREE.Color;
};

/** Put many small pieces into one draw call while keeping their individual colors. */
export function gardenBatch(
  geometry: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial,
  instances: GardenInstance[],
) {
  const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
  const matrix = new THREE.Matrix4();
  instances.forEach(({ position, rotation, scale, color }, index) => {
    mesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
    mesh.setColorAt(index, color);
  });
  mesh.receiveShadow = true;
  return mesh;
}

/** A curved, tapered tube with lengthwise color variation. */
export function taperedStem(
  points: THREE.Vector3[],
  radii: number[],
  sides: number,
  shade: THREE.Color,
  ridges: number,
) {
  const path = new THREE.CatmullRomCurve3(points);
  const segments = Math.max(4, (points.length - 1) * 3);
  const { normals, binormals } = path.computeFrenetFrames(segments, false);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= segments; row++) {
    const t = row / segments;
    const p = path.getPointAt(t);
    const slice = t * (radii.length - 1);
    const index = Math.min(radii.length - 2, Math.floor(slice));
    const radius = THREE.MathUtils.lerp(radii[index], radii[index + 1], slice - index);
    for (let side = 0; side < sides; side++) {
      const a = (side / sides) * Math.PI * 2;
      const groove = Math.sin(a * 5 + t * 3) * Math.cos(a * 9 - t * 4);
      const r = radius * (1 + groove * ridges);
      const v = p.clone().addScaledVector(normals[row], Math.cos(a) * r)
        .addScaledVector(binormals[row], Math.sin(a) * r);
      positions.push(v.x, v.y, v.z);
      const tint = 0.86 + groove * ridges * 0.85 + Math.sin(a * 3 - t) * 0.1;
      colors.push(shade.r * tint, shade.g * tint, shade.b * tint);
      if (row < segments) {
        const i = row * sides + side;
        const j = row * sides + ((side + 1) % sides);
        indices.push(i, j, i + sides, j, j + sides, i + sides);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
