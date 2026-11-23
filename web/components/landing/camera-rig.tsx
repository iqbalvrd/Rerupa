"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { CAMERA, TRAVEL } from "./landing-config";
import { easeInOutCubic, getCameraCurve, smooth } from "./scene-utils";
import { useTravel } from "./travel-state";

/**
 * Fixed camera path, Kong Studios style (LANDING_SPEC §3, §4.10): idle on the
 * low title-screen angle; on enter, walk the curve with ease-in-out while the
 * look target slides from near the statue to the door. Drives the white fade
 * element directly so no React state changes per frame.
 */
/** 0–1 progress of `p` through the [from, to] window. */
function progress([from, to]: readonly [number, number], p: number) {
  return Math.min(1, Math.max(0, (p - from) / (to - from)));
}

export function CameraRig({ whiteRef, onArrive }: { whiteRef: RefObject<HTMLDivElement | null>; onArrive: () => void }) {
  const travel = useTravel();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const arrived = useRef(false);
  const tmp = useMemo(
    () => ({
      look: new THREE.Vector3(),
      start: new THREE.Vector3(),
      door: new THREE.Vector3(...CAMERA.lookDoor),
      stop: new THREE.Vector3(),
      enter: new THREE.Vector3(...CAMERA.enterTo),
      inside: new THREE.Vector3(...CAMERA.lookInside),
    }),
    [],
  );

  useFrame((state) => {
    const { width, height } = state.size;
    const aspect = width / Math.max(1, height);
    const fov = aspect < CAMERA.portraitAspect ? CAMERA.fov.portrait : aspect < CAMERA.squareAspect ? CAMERA.fov.square : CAMERA.fov.landscape;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    tmp.start.set(...(aspect < CAMERA.portraitAspect ? CAMERA.lookStartPortrait : CAMERA.lookStart));

    if (travel.phase === "travel") {
      travel.t = Math.min(1, (performance.now() - travel.startedAt) / 1000 / TRAVEL.duration);
      if (whiteRef.current) whiteRef.current.style.opacity = String(smooth(TRAVEL.white[0], TRAVEL.white[1], travel.t));
      if (travel.t >= 1 && !arrived.current) {
        arrived.current = true;
        onArrive();
      }
    }
    const p = travel.phase === "idle" ? 0 : travel.t;
    // 1) Walk the curve and stop in front of the door, 2) stand still while it
    // opens, 3) walk straight through the doorway into the lit passage.
    const walk = progress(TRAVEL.walk, p);
    const walkIn = easeInOutCubic(progress(TRAVEL.walkIn, p));
    getCameraCurve().getPointAt(easeInOutCubic(walk), tmp.stop);
    camera.position.copy(tmp.stop).lerp(tmp.enter, walkIn);
    tmp.look.copy(tmp.start).lerp(tmp.door, smooth(TRAVEL.look[0], TRAVEL.look[1], p)).lerp(tmp.inside, walkIn);
    camera.lookAt(tmp.look);
  });
  return null;
}
