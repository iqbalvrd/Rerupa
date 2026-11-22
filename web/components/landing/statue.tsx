"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { COLORS, STATUE } from "./landing-config";
import { disposeTree, rbox, solid } from "./scene-utils";

/**
 * Bronze elephant on a white plinth, three-quarter facing right (LANDING_SPEC §4.7).
 * The figure is still the prototype's placeholder of spheres and cylinders:
 * the elephant model is an open team decision (LANDING_SPEC §7, §10.1).
 */
export function Statue({ portrait }: { portrait: boolean }) {
  const group = useMemo(() => {
    const statue = new THREE.Group();
    const base = solid(COLORS.base);
    const wall = solid(COLORS.wall);
    const trim = solid(COLORS.trim, 0.7);
    const bronze = solid(COLORS.bronze, 0.32, 0.9);
    rbox(statue, 6.4, 0.5, 6.4, base, 0, 0.25, 0, 0.12);
    rbox(statue, 5.4, 2.9, 5.4, wall, 0, 1.95, 0, 0.12);
    rbox(statue, 6.0, 0.4, 6.0, trim, 0, 3.55, 0, 0.1);

    const fig = new THREE.Group();
    fig.position.y = 3.75;
    fig.rotation.y = STATUE.figureRotationY;
    statue.add(fig);
    const bz = (geo: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rz = 0) => {
      const m = new THREE.Mesh(geo, bronze);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.rotation.z = rz;
      m.castShadow = true;
      fig.add(m);
    };
    const sph = new THREE.SphereGeometry(1, 32, 24);
    bz(sph, 0, 2.95, 0, 2.3, 1.35, 1.2); // body
    for (const [x, z] of [
      [-1.5, -0.7],
      [-1.5, 0.7],
      [1.3, -0.7],
      [1.3, 0.7],
    ])
      bz(new THREE.CylinderGeometry(0.38, 0.44, 2.1, 20), x, 1.05, z); // legs
    bz(sph, 2.55, 3.45, 0, 0.95, 0.95, 0.95); // head
    bz(new THREE.CylinderGeometry(0.3, 0.15, 2.4, 16), 3.25, 2.2, 0, 1, 1, 1, 0.25); // trunk
    for (const s of [-1, 1]) bz(sph, 2.1, 3.5, s * 0.85, 0.22, 0.85, 0.78); // ears
    return statue;
  }, []);
  useEffect(() => () => disposeTree(group), [group]);
  const p = portrait ? STATUE.portrait : STATUE.desktop;
  return <primitive object={group} position={p} />;
}
