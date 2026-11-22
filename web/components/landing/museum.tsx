"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { COLORS, DOORWAY, MUSEUM, MZ } from "./landing-config";
import { disposeTree, rbox, solid } from "./scene-utils";

/**
 * Gedung Gajah from primitives (LANDING_SPEC §4.5): plain neoclassical front,
 * long windowed wings, three steps, a six-column portico with a pediment, and
 * two garden lamps. The door itself lives in <Door>.
 */
/**
 * A wall block with the doorway cut out: left and right parts, plus a part
 * above the opening when the block reaches higher than the lintel.
 */
function splitAroundDoor(
  g: THREE.Group,
  mat: THREE.Material,
  b: { x0: number; x1: number; y0: number; y1: number; z: number; d: number; r: number },
) {
  const hw = DOORWAY.halfWidth;
  const h = b.y1 - b.y0;
  const yc = (b.y0 + b.y1) / 2;
  const side = (from: number, to: number) => rbox(g, to - from, h, b.d, mat, (from + to) / 2, yc, b.z, b.r);
  side(b.x0, -hw);
  side(hw, b.x1);
  const top = Math.max(b.y0, DOORWAY.topY);
  if (b.y1 > top) rbox(g, hw * 2, b.y1 - top, b.d, mat, 0, (top + b.y1) / 2, b.z, Math.min(b.r, 0.05));
}

export function Museum() {
  const group = useMemo(() => {
    const g = new THREE.Group();
    const wall = solid(COLORS.wall);
    const trim = solid(COLORS.trim, 0.7);
    const base = solid(COLORS.base);
    const roof = solid(COLORS.roof);
    const glass = solid(COLORS.glass, 0.35);
    const frame = solid(COLORS.windowFrame, 0.7);
    const step = solid(COLORS.steps, 0.9);

    // Body: plinth, wings, cornice, flat roof, string course.
    rbox(g, 104, 1.0, 16, base, 0, 0.5, MZ - 6, 0.15);
    // The body is cut around the doorway so the lit passage can run inside.
    splitAroundDoor(g, wall, { x0: -50, x1: 50, y0: 1.0, y1: 11.4, z: MZ - 6, d: 12, r: 0.12 });
    rbox(g, 101.6, 0.7, 13.4, trim, 0, 11.75, MZ - 6);
    rbox(g, 100.8, 0.9, 12.6, roof, 0, 12.55, MZ - 6);
    splitAroundDoor(g, trim, { x0: -50.5, x1: 50.5, y0: 3.925, y1: 4.275, z: MZ - 6 + 0.05, d: 12.8, r: 0.08 });

    // Tall windows with sills, lintels and pilasters between them.
    for (let i = -MUSEUM.windowRange; i <= MUSEUM.windowRange; i++) {
      if (Math.abs(i) < MUSEUM.windowSkip) continue;
      const x = i * MUSEUM.windowSpacing;
      rbox(g, 2.6, 5.6, 0.3, frame, x, 6.6, MZ + 0.05);
      rbox(g, 2.1, 5.0, 0.3, glass, x, 6.6, MZ + 0.12, 0.05);
      rbox(g, 3.2, 0.45, 0.6, trim, x, 9.65, MZ + 0.2);
      rbox(g, 3.0, 0.3, 0.55, trim, x, 3.75, MZ + 0.2);
      rbox(g, 0.8, 10.2, 0.45, trim, x + 3.1, 6.2, MZ + 0.15);
    }

    MUSEUM.steps.forEach(([w, d, z], i) =>
      rbox(g, w, MUSEUM.stepHeight, d, step, 0, MUSEUM.stepHeight / 2 + i * MUSEUM.stepHeight, z, 0.05),
    );

    // Portico: back wall, entablature, pediment with a slightly darker tympanum.
    splitAroundDoor(g, wall, { x0: -13, x1: 13, y0: 1.3, y1: 13.5, z: MZ + 0.5, d: 1, r: 0.08 });
    rbox(g, 29.2, 1.5, 9.4, trim, 0, 12.85, MZ + 4.2);
    rbox(g, 29.8, 0.4, 9.8, trim, 0, 13.8, MZ + 4.2);
    const tri = new THREE.Shape();
    tri.moveTo(-15, 0);
    tri.lineTo(15, 0);
    tri.lineTo(0, 5.4);
    tri.lineTo(-15, 0);
    const ped = new THREE.Mesh(
      new THREE.ExtrudeGeometry(tri, { depth: 9.6, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 }),
      trim,
    );
    ped.position.set(0, 14.0, MZ - 0.6);
    ped.castShadow = true;
    g.add(ped);
    const inner = new THREE.Shape();
    inner.moveTo(-12.6, 0);
    inner.lineTo(12.6, 0);
    inner.lineTo(0, 4.3);
    inner.lineTo(-12.6, 0);
    const tym = new THREE.Mesh(new THREE.ShapeGeometry(inner), solid(COLORS.tympanum));
    tym.position.set(0, 14.5, MZ + 9.15);
    g.add(tym);

    // Six columns: shaft, flared capital and base, square plinths.
    const shaft = new THREE.CylinderGeometry(0.62, 0.74, 10.2, 32);
    const cap = new THREE.CylinderGeometry(0.95, 0.68, 0.45, 32);
    const foot = new THREE.CylinderGeometry(0.85, 0.95, 0.4, 32);
    for (const x of MUSEUM.columnsX) {
      const z = MUSEUM.columnZ;
      for (const [geo, y] of [
        [shaft, 6.66],
        [cap, 12.0],
        [foot, 1.46],
      ] as const) {
        const m = new THREE.Mesh(geo, trim);
        m.position.set(x, y, z);
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
      }
      rbox(g, 2.0, 0.35, 2.0, trim, x, 12.38, z);
      rbox(g, 2.0, 0.3, 2.0, trim, x, 1.42 - 0.2, z);
    }

    // The door's architrave, fanlight and hood live in <Door>.

    // Garden lamps either side of the steps.
    const postMat = solid(COLORS.lampPost, 0.5, 0.6);
    const bulbMat = new THREE.MeshBasicMaterial({ color: COLORS.lampBulb });
    for (const x of [-MUSEUM.lampX, MUSEUM.lampX]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 4.2, 12), postMat);
      post.position.set(x, 2.1, MUSEUM.lampZ);
      post.castShadow = true;
      g.add(post);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), bulbMat);
      bulb.position.set(x, 4.45, MUSEUM.lampZ);
      g.add(bulb);
    }
    return g;
  }, []);
  useEffect(() => () => disposeTree(group), [group]);
  return <primitive object={group} />;
}
