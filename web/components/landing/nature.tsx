"use client";

import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { NATURE } from "./landing-config";

type ModelName =
  | "CommonTree_1"
  | "CommonTree_3"
  | "Bush_Common"
  | "Bush_Common_Flowers"
  | "Flower_3_Group"
  | "Flower_4_Group"
  | "Grass_Common_Short";

/** Seeded random, so the hedge and rotations look the same on every visit. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/**
 * Quaternius Stylized Nature MegaKit (CC0), compressed into one glb with 7
 * named scenes (LANDING_SPEC §4.9): trees around the yard, a hedge along the
 * facade, flowers by the path and flowering bushes around the statue.
 */
export function Nature() {
  const gltf = useGLTF(NATURE.url);
  const group = useMemo(() => {
    const byName = new Map<string, THREE.Object3D>();
    for (const sc of gltf.scenes) {
      const root = sc.children[0];
      if (root) byName.set(root.name, root);
    }
    for (const root of byName.values()) {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.receiveShadow = true;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.map) mat.alphaTest = NATURE.alphaTest;
      });
    }
    const rnd = seeded(11);
    const g = new THREE.Group();
    const put = (name: ModelName, x: number, z: number, s = 1, ry = rnd() * Math.PI * 2) => {
      const src = byName.get(name);
      if (!src) return;
      const o = src.clone(true);
      o.position.set(x, 0, z);
      o.scale.setScalar(s);
      o.rotation.y = ry;
      g.add(o);
    };
    for (const [x, z, s, name] of NATURE.trees) put(name, x, z, s);
    const h = NATURE.hedge;
    for (let x = h.from; x <= h.to; x += h.step) {
      if (Math.abs(x) < h.skipInside) continue;
      put(rnd() < h.flowering ? "Bush_Common_Flowers" : "Bush_Common", x, h.z, h.scaleMin + rnd() * h.scaleRange);
    }
    NATURE.flowers.forEach(([x, z], i) => put(i % 2 ? "Flower_3_Group" : "Flower_4_Group", x, z, NATURE.flowerScale));
    for (const [x, z] of NATURE.statueBushes) put("Bush_Common_Flowers", x, z, NATURE.statueBushScale);
    return g;
  }, [gltf]);

  return <primitive object={group} />;
}

useGLTF.preload(NATURE.url);
