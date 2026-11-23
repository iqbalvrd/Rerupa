"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { COLORS, DOORWAY, MUSEUM, MZ } from "./landing-config";
import { museumMaterials } from "./museum-materials";
import { disposeTree, solid } from "./scene-utils";

type Point = [number, number, number];
const UP = new THREE.Vector3(0, 1, 0);

function buildMuseum() {
  const root = new THREE.Group();
  const mat = museumMaterials();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();

  function add(material: THREE.Material, geometry: THREE.BufferGeometry, useWorldUv = true) {
    if (useWorldUv) {
      const p = geometry.getAttribute("position");
      const n = geometry.getAttribute("normal");
      const uv = geometry.getAttribute("uv");
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        if (Math.abs(n.getY(i)) > 0.71) uv.setXY(i, x / 4.5, z / 4.5);
        else uv.setXY(i, (Math.abs(n.getZ(i)) > 0.7 ? x : z) / 3.25, y / 4);
      }
    }
    const item = geometry.index ? geometry.toNonIndexed() : geometry;
    if (item !== geometry) geometry.dispose();
    let bucket = batches.get(material);
    if (!bucket) batches.set(material, bucket = []);
    bucket.push(item);
  }

  function box(material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) {
    add(material, new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  }

  function beam(material: THREE.Material, from: Point, to: Point, w: number, d = w) {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const length = direction.length();
    const middle = start.lerp(end, 0.5);
    const rotation = new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize());
    const matrix = new THREE.Matrix4().compose(middle, rotation, new THREE.Vector3(1, 1, 1));
    add(material, new THREE.BoxGeometry(w, length, d).applyMatrix4(matrix));
  }

  // Preserve the original door aperture, floor and the path through its lit passage.
  function portalWall(z: number, d: number, width: number, bottom: number, top: number, material: THREE.Material) {
    const hw = DOORWAY.halfWidth;
    for (const side of [-1, 1]) {
      box(material, width / 2 - hw, top - bottom, d, side * (width / 2 + hw) / 2, (top + bottom) / 2, z);
    }
    if (top > DOORWAY.topY) {
      box(material, hw * 2, top - DOORWAY.topY, d, 0, (DOORWAY.topY + top) / 2, z);
    }
  }

  function roofFace(corners: Point[], side: "x" | "z") {
    const a = new THREE.Vector3(...corners[0]);
    const b = new THREE.Vector3(...corners[1]);
    const c = new THREE.Vector3(...corners[2]);
    const normal = b.sub(a).cross(c.sub(a));
    const uvs = corners.flatMap(([x, y, z]) =>
      [(side === "x" ? x : z) / 4.5, (y - corners[0][1]) / 3.15],
    );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(corners.flat(), 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    const indices: number[] = [];
    for (let i = 1; i < corners.length - 1; i++) {
      indices.push(...(normal.y >= 0 ? [0, i, i + 1] : [0, i + 1, i]));
    }
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    add(mat.roof, geometry, false);
  }

  function hipRoof(x: number, z: number, width: number, depth: number, y: number, rise: number, hipDepth = depth * 0.43) {
    const hw = width / 2, hd = depth / 2;
    const leftFront: Point = [x - hw, y, z + hd];
    const rightFront: Point = [x + hw, y, z + hd];
    const leftBack: Point = [x - hw, y, z - hd];
    const rightBack: Point = [x + hw, y, z - hd];
    const inset = Math.min(hw - 0.45, hipDepth);
    const leftRidge: Point = [x - hw + inset, y + rise, z];
    const rightRidge: Point = [x + hw - inset, y + rise, z];

    roofFace([leftFront, rightFront, rightRidge, leftRidge], "x");
    roofFace([rightBack, leftBack, leftRidge, rightRidge], "x");
    roofFace([leftFront, leftRidge, leftBack], "z");
    roofFace([rightFront, rightBack, rightRidge], "z");
    for (const [from, to] of [[leftFront, leftRidge], [leftBack, leftRidge], [rightFront, rightRidge], [rightBack, rightRidge]]) {
      beam(mat.clay, from, to, 0.19);
    }
    beam(mat.clay, leftRidge, rightRidge, 0.26);
    box(mat.clay, width + 0.06, 0.26, depth + 0.06, x, y - 0.1, z);
    box(mat.teakDark, width + 0.12, 0.15, depth + 0.09, x, y - 0.27, z);
    box(mat.paintedWood, width - 0.05, 0.21, depth - 0.03, x, y - 0.44, z);
    for (const [rx, ry, rz] of [leftRidge, rightRidge]) {
      add(mat.clay, new THREE.CylinderGeometry(0.045, 0.14, 0.65, 6).translate(rx, ry + 0.28, rz));
    }
  }

  function archedPanel(material: THREE.Material, x: number, bottom: number, z: number, width: number, height: number, depth: number) {
    const radius = width / 2;
    const spring = height - radius;
    const shape = new THREE.Shape();
    shape.moveTo(-radius, 0);
    shape.lineTo(radius, 0);
    shape.lineTo(radius, spring);
    shape.absarc(0, spring, radius, 0, Math.PI, false);
    shape.closePath();
    add(material, new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 }).translate(x, bottom, z));
  }

  function windowBay(x: number, y: number, z: number, width: number, height: number) {
    archedPanel(mat.cream, x, y - 0.13, z, width + 0.65, height + 0.52, 0.23);
    archedPanel(mat.teakDark, x, y, z + 0.23, width + 0.16, height + 0.08, 0.12);
    archedPanel(mat.window, x, y + 0.10, z + 0.35, width - 0.18, height - 0.21, 0.05);
    const springY = y + height - width / 2;
    box(mat.teak, width * 0.9, 0.1, 0.1, x, springY, z + 0.4);
    box(mat.teak, 0.12, height - 0.32, 0.1, x, y + height * 0.5, z + 0.41);
    for (const side of [-1, 1]) {
      const sx = x + side * width * 0.25;
      box(mat.olive, width * 0.38, springY - y - 0.24, 0.08, sx, (y + springY) / 2, z + 0.44);
      for (let row = 0; row < 9; row++) {
        const slat = new THREE.BoxGeometry(width * 0.38, 0.15, 0.12)
          .rotateX(-0.45).translate(sx, y + 0.29 + row * (springY - y - 0.55) / 8, z + 0.5);
        add(row % 3 ? mat.olive : mat.teakDark, slat);
      }
    }
    box(mat.stone, width + 0.79, 0.21, 0.64, x, y - 0.15, z + 0.22);
    box(mat.cream, width + 0.5, 0.16, 0.51, x, y - 0.35, z + 0.19);
  }

  // Stone foundation and plaster wings.
  box(mat.stone, 103, 1.02, 15.1, 0, 0.51, MZ - 5.8);
  portalWall(MZ - 6, 12, 99, 1.02, 11.6, mat.plaster);
  portalWall(MZ - 5.93, 12.38, 99.3, 2.29, 2.51, mat.stone);
  portalWall(MZ - 5.96, 12.42, 99.5, 10.48, 10.78, mat.cream);
  portalWall(MZ - 5.92, 12.5, 99.7, 11.46, 11.83, mat.cream);
  hipRoof(-33, MZ - 5.2, 35.1, 15, 12, 4.28);
  hipRoof(33, MZ - 5.2, 35.1, 15, 12, 4.28);

  for (const side of [-1, 1]) {
    for (let bay = 0; bay < 5; bay++) {
      const x = side * (16.9 + bay * 6.7);
      windowBay(x, 3.15, MZ + 0.04, 2.64, 5.8);
      const pier = x + side * 3.35;
      box(mat.recessed, 0.9, 9.15, 0.31, pier, 5.84, MZ + 0.06);
      box(mat.plaster, 0.64, 8.45, 0.37, pier, 5.95, MZ + 0.18);
      box(mat.cream, 1.16, 0.28, 0.61, pier, 10.17, MZ + 0.3);
      box(mat.stone, 1.21, 0.43, 0.58, pier, 1.55, MZ + 0.27);
    }
  }

  MUSEUM.steps.forEach(([w, d, z], i) => {
    const bottom = i * MUSEUM.stepHeight;
    box(mat.stone, w, MUSEUM.stepHeight, d, 0, bottom + MUSEUM.stepHeight / 2, z);
    box(mat.cream, w + 0.06, 0.067, 0.25, 0, bottom + MUSEUM.stepHeight - 0.05, z + d / 2);
    for (let x = -Math.floor(w / 4) * 1.9; x < w / 2; x += 1.9) {
      box(mat.stoneShade, 0.023, MUSEUM.stepHeight - 0.075, 0.013, x, bottom + 0.18, z + d / 2 + 0.009);
    }
  });

  // Taller limasan volume, behind the open timber porch.
  portalWall(MZ + 0.5, 1, 26, DOORWAY.floorY, 13.1, mat.recessed);
  box(mat.plaster, 28.95, 1.54, 12.8, 0, 12.35, MZ - 3.4);
  box(mat.cream, 30.3, 0.31, 13.27, 0, 12.19, MZ - 3.33);
  box(mat.cream, 30.5, 0.35, 13.58, 0, 13.10, MZ - 3.3);
  hipRoof(0, MZ - 3.15, 34.9, 17.8, 13.57, 8.05, 11.8);

  for (const side of [-1, 1]) {
    // Recessed side openings frame the existing bright main door.
    windowBay(side * 6.75, 2.82, MZ + 1.02, 2.75, 6.65);
    windowBay(side * 11.15, 2.82, MZ + 1.02, 2.08, 6.3);
  }

  const porchFront = MUSEUM.columnZ + 1.38;
  const porchBack = MZ + 0.78;
  const porchBottom = 11.36;
  const porchTop = 12.82;
  const eaveHalf = 14.72;
  roofFace([[-eaveHalf, porchBottom, porchFront], [eaveHalf, porchBottom, porchFront],
    [eaveHalf, porchTop, porchBack], [-eaveHalf, porchTop, porchBack]], "x");
  for (const side of [-1, 1]) {
    beam(mat.teakDark, [eaveHalf * side, porchBottom - 0.14, porchFront],
      [eaveHalf * side, porchTop - 0.14, porchBack], 0.20, 0.25);
  }
  box(mat.clay, 29.6, 0.22, 0.32, 0, porchBottom - 0.06, porchFront);
  box(mat.teakDark, 29.8, 0.32, 0.38, 0, porchBottom - 0.34, porchFront);
  box(mat.paintedWood, 29.55, 0.10, 0.42, 0, porchBottom - 0.24, porchFront + 0.02);
  box(mat.teak, 27.4, 0.43, 0.52, 0, porchBottom - 0.55, MUSEUM.columnZ);
  box(mat.agedGold, 27.2, 0.06, 0.59, 0, porchBottom - 0.71, MUSEUM.columnZ + 0.02);

  // A scalloped wooden fascia and brackets give the entrance a finer silhouette.
  const pendant = new THREE.Shape();
  pendant.moveTo(-0.21, 0);
  pendant.lineTo(0.21, 0);
  pendant.lineTo(0.21, -0.19);
  pendant.quadraticCurveTo(0.18, -0.34, 0, -0.47);
  pendant.quadraticCurveTo(-0.18, -0.34, -0.21, -0.19);
  pendant.closePath();
  const pendantGeo = new THREE.ExtrudeGeometry(pendant, { depth: 0.12, bevelEnabled: false, curveSegments: 4 });
  for (let i = -31; i <= 31; i++) {
    const x = i * 0.46;
    add(mat.paintedWood, pendantGeo.clone().translate(x, porchBottom - 0.49, porchFront + 0.05));
    const button = new THREE.CircleGeometry(0.071, 6).translate(x, porchBottom - 0.68, porchFront + 0.171);
    add(mat.agedGold, button);
  }
  pendantGeo.dispose();

  for (const x of MUSEUM.columnsX) {
    const z = MUSEUM.columnZ;
    box(mat.stone, 1.58, 0.29, 1.52, x, 1.43, z);
    box(mat.cream, 1.37, 0.18, 1.28, x, 1.66, z);
    box(mat.stone, 1.18, 0.62, 1.15, x, 2.06, z);
    box(mat.teakDark, 1.06, 0.21, 1.06, x, 2.45, z);
    box(mat.teak, 0.79, 7.75, 0.78, x, 6.4, z);
    box(mat.paintedWood, 0.62, 7.55, 0.063, x, 6.36, z + 0.401);
    for (const side of [-1, 1]) {
      box(mat.olive, 0.08, 7.35, 0.07, x + side * 0.21, 6.35, z + 0.444);
      beam(mat.teak, [x + side * 0.25, 9.05, z], [x + side * 1.51, 10.62, z], 0.23, 0.32);
      beam(mat.agedGold, [x + side * 0.43, 9.16, z + 0.18], [x + side * 1.43, 10.47, z + 0.18], 0.062, 0.06);
    }
    box(mat.paintedWood, 1.09, 0.18, 1.08, x, 10.4, z);
    box(mat.teakDark, 1.27, 0.25, 1.18, x, 10.62, z);
  }

  // The garden fixtures retain their original positions and materials.
  const postMat = solid(COLORS.lampPost, 0.5, 0.6);
  const bulbMat = new THREE.MeshBasicMaterial({ color: COLORS.lampBulb });
  for (const x of [-MUSEUM.lampX, MUSEUM.lampX]) {
    add(postMat, new THREE.CylinderGeometry(0.12, 0.16, 4.2, 12).translate(x, 2.1, MUSEUM.lampZ));
    add(bulbMat, new THREE.SphereGeometry(0.42, 16, 12).translate(x, 4.45, MUSEUM.lampZ));
  }

  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries);
    geometries.forEach((geometry) => geometry.dispose());
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = material !== bulbMat;
    mesh.receiveShadow = material !== bulbMat;
    root.add(mesh);
  }
  return { root, textures: mat.textures };
}

export function Museum() {
  const built = useMemo(buildMuseum, []);
  useEffect(() => () => {
    disposeTree(built.root);
    built.textures.forEach((texture) => texture.dispose());
  }, [built]);
  return <primitive object={built.root} />;
}
