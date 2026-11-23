"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { buildGardenFlowers } from "./garden-flowers";
import { buildFeatureTrees } from "./garden-trees";
import { NATURE } from "./landing-config";
import { disposeTree, seededRandom } from "./scene-utils";

type ModelName =
  | "CommonTree_1"
  | "CommonTree_3"
  | "Bush_Common"
  | "Bush_Common_Flowers";

/** The background trees and shrub leaves share the Quaternius pack (CC0). */
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
    const rnd = seededRandom(11);
    const g = new THREE.Group();
    const put = (name: ModelName, x: number, z: number, s = 1, ry = rnd() * Math.PI * 2) => {
      const src = byName.get(name);
      if (!src) return;
      const o = src.clone(true);
      o.position.set(x, 0, z);
      o.scale.setScalar(s);
      o.rotation.y = ry;
      if (name === "Bush_Common_Flowers") {
        // Reuse the green foliage primitive and replace the pack's blossom primitive.
        const oldBlossom = o.children.find((child) =>
          child instanceof THREE.Mesh && child.material.name === "Flowers",
        );
        oldBlossom?.removeFromParent();
      }
      g.add(o);
    };
    for (const [x, z, s, name] of NATURE.trees) put(name, x, z, s);
    const floweringShrubs = [];
    const h = NATURE.hedge;
    for (let x = h.from; x <= h.to; x += h.step) {
      if (Math.abs(x) < h.skipInside) continue;
      const flowering = rnd() < h.flowering;
      const scale = h.scaleMin + rnd() * h.scaleRange;
      put(flowering ? "Bush_Common_Flowers" : "Bush_Common", x, h.z, scale);
      if (flowering) floweringShrubs.push({ x, z: h.z, scale });
    }
    for (const [x, z] of NATURE.statueBushes) {
      put("Bush_Common_Flowers", x, z, NATURE.statueBushScale);
      floweringShrubs.push({ x, z, scale: NATURE.statueBushScale });
    }
    const trees = buildFeatureTrees(NATURE.featureTrees);
    const flowers = buildGardenFlowers(NATURE.flowerBeds, floweringShrubs, trees.blooms);
    g.add(trees.group, flowers);
    return { scene: g, trees, flowers };
  }, [gltf]);

  useEffect(() => () => {
    for (const plants of [group.trees.group, group.flowers]) {
      plants.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      disposeTree(plants);
    }
    group.trees.texture.dispose();
  }, [group]);

  return <primitive object={group.scene} />;
}

useGLTF.preload(NATURE.url);
