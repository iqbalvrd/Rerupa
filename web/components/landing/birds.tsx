"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { BIRDS, COLORS } from "./landing-config";
import { canvasTexture } from "./scene-utils";
import { useTravel } from "./travel-state";

/** A few flapping bird sprites crossing the sky. */
export function Birds() {
  const travel = useTravel();
  const built = useMemo(() => {
    const tex = canvasTexture(64, 32, (g) => {
      g.strokeStyle = COLORS.bird;
      g.lineWidth = 4;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(4, 20);
      g.quadraticCurveTo(18, 4, 32, 18);
      g.quadraticCurveTo(46, 4, 60, 20);
      g.stroke();
    });
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false });
    const birds = Array.from({ length: BIRDS.count }, (_, i) => {
      const b = new THREE.Sprite(mat);
      b.scale.set(1.6, 0.8, 1);
      b.position.set(-50 + i * 10, 28 + (i % 3) * 3, -70 - i * 4);
      b.userData.v = 2 + i * 0.4;
      return b;
    });
    return { tex, mat, birds };
  }, []);
  useEffect(
    () => () => {
      built.tex.dispose();
      built.mat.dispose();
    },
    [built],
  );

  useFrame(({ clock }, delta) => {
    if (travel.reduceMotion) return;
    const dt = Math.min(delta, 0.05);
    const now = clock.getElapsedTime();
    for (const b of built.birds) {
      b.position.x += (b.userData.v as number) * dt;
      b.position.y += Math.sin(now * 2 + b.position.x) * 0.01;
      if (b.position.x > BIRDS.wrapX) b.position.x = -BIRDS.wrapX;
      b.scale.y = 0.8 * (0.75 + 0.25 * Math.abs(Math.sin(now * 6 + b.position.x)));
    }
  });

  return (
    <>
      {built.birds.map((b, i) => (
        <primitive key={i} object={b} />
      ))}
    </>
  );
}
