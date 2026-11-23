"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { COLORS, STATUE } from "./landing-config";
import { disposeTree, rbox, solid } from "./scene-utils";

/** The existing white plinth stays visible while the bronze figure loads. */
export function StatuePedestal() {
  const pedestal = useMemo(() => {
    const group = new THREE.Group();
    rbox(group, 6.4, 0.5, 6.4, solid(COLORS.base), 0, 0.25, 0, 0.12);
    rbox(group, 5.4, 2.9, 5.4, solid(COLORS.wall), 0, 1.95, 0, 0.12);
    rbox(group, 6.0, 0.4, 6.0, solid(COLORS.trim, 0.7), 0, 3.55, 0, 0.1);
    return group;
  }, []);
  useEffect(() => () => disposeTree(pedestal), [pedestal]);
  return <primitive object={pedestal} />;
}

export function StatueFigure() {
  const { scene } = useGLTF(STATUE.figureUrl);
  const figure = useMemo(() => {
    const model = scene.clone();
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = true;
    });
    return model;
  }, [scene]);

  return (
    <primitive
      object={figure}
      position-y={STATUE.pedestalTop}
      rotation-y={STATUE.figureRotationY}
    />
  );
}

useGLTF.preload(STATUE.figureUrl);
