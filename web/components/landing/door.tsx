"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { COLORS, DOOR, DZ } from "./landing-config";
import { disposeTree, doorOpenAt, glowTexture, rbox, solid } from "./scene-utils";
import { useTravel } from "./travel-state";

/**
 * Two wooden leaves hinged on their outer edges, a lit plane behind them, an
 * additive glow and a lamp that switches on as they open. Leaves and glow are
 * the click target for "enter" (LANDING_SPEC §3.2, §4.5).
 */
export function Door({ onEnter }: { onEnter: () => void }) {
  const travel = useTravel();
  const parts = useMemo(() => {
    const root = new THREE.Group();
    const wood = solid(COLORS.door, 0.55);
    const knobMat = solid(COLORS.doorKnob, 0.3, 1);

    const light = new THREE.Mesh(
      new THREE.PlaneGeometry(4, DOOR.leafHeight),
      new THREE.MeshBasicMaterial({ color: COLORS.doorLight, toneMapped: false }),
    );
    light.position.set(0, DOOR.y, DZ - 0.25);
    root.add(light);

    const leaf = (hingeX: number, dir: 1 | -1) => {
      const g = new THREE.Group();
      g.position.set(hingeX, DOOR.y, DZ);
      rbox(g, DOOR.leafWidth, DOOR.leafHeight, 0.25, wood, dir * 1, 0, 0, 0.04);
      for (const y of [1.6, -1.6]) rbox(g, 1.3, 2.6, 0.08, wood, dir * 1, y, 0.15, 0.03);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), knobMat);
      knob.position.set(dir * 1.75, 0, 0.22);
      g.add(knob);
      root.add(g);
      return g;
    };
    const left = leaf(-2, 1);
    const right = leaf(2, -1);

    const lamp = new THREE.PointLight(COLORS.doorLamp, 0, 20, 1.5);
    lamp.position.set(0, 4.8, DZ + 1.6);
    root.add(lamp);

    const tex = glowTexture();
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    glow.scale.set(DOOR.glowScale, DOOR.glowScale, 1);
    glow.position.set(0, DOOR.y, DZ + 0.6);
    root.add(glow);
    return { root, left, right, lamp, glow, tex };
  }, []);
  useEffect(
    () => () => {
      disposeTree(parts.root);
      parts.tex.dispose();
    },
    [parts],
  );

  useFrame(({ clock }) => {
    const now = clock.getElapsedTime();
    const pulse = travel.reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(now * 2.2);
    parts.glow.material.opacity = (travel.hovering ? 1 : 0.7) * pulse;
    const open = travel.phase === "idle" ? 0 : doorOpenAt(travel.t);
    parts.left.rotation.y = open * DOOR.openAngle;
    parts.right.rotation.y = -open * DOOR.openAngle;
    parts.lamp.intensity = open * DOOR.lampIntensity;
    parts.glow.scale.setScalar(DOOR.glowScale + open * DOOR.glowGrow);
  });

  const setHover = (on: boolean) => (e: ThreeEvent<PointerEvent>) => {
    if (travel.phase !== "idle") return;
    e.stopPropagation();
    travel.hovering = on;
    document.body.style.cursor = on ? "pointer" : "";
  };
  useEffect(() => () => void (document.body.style.cursor = ""), []);

  return (
    <primitive
      object={parts.root}
      onPointerOver={setHover(true)}
      onPointerOut={setHover(false)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        travel.hovering = false;
        document.body.style.cursor = "";
        onEnter();
      }}
    />
  );
}
