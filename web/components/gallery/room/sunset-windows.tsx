"use client";

import { useEffect, useMemo, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { HALL, type RoomPlan } from "./plan";
import type { RoomControl } from "./room-scene";

function eveningSky() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, "#777caa");
  gradient.addColorStop(0.42, "#ba8c9d");
  gradient.addColorStop(0.76, "#e9aa83");
  gradient.addColorStop(1, "#f3d3a0");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 512);
  const haze = ctx.createRadialGradient(785, 360, 3, 785, 360, 155);
  haze.addColorStop(0, "#ffe5b4d9");
  haze.addColorStop(1, "#ffe5b400");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = "#ffe6b3";
  ctx.beginPath();
  ctx.arc(785, 360, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = "blur(13px)";
  for (let i = 0; i < 38; i++) {
    const x = (i * 173) % 1160 - 70;
    const y = 55 + (i * 59) % 280;
    ctx.fillStyle = i % 3 === 0 ? "#ffe0c12e" : "#65638022";
    ctx.beginPath();
    ctx.ellipse(x, y, 80 + i % 4 * 24, 8 + i % 5 * 3, -0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.filter = "none";
  return canvas;
}

/** Both windows share the sky palette; only the front window animates birds. */
export function SunsetWindows({ plan, control }: { plan: RoomPlan; control: RefObject<RoomControl> }) {
  const invalidate = useThree(state => state.invalidate);
  const sky = useMemo(() => {
    const background = eveningSky();
    const roofTexture = new THREE.CanvasTexture(background);
    roofTexture.colorSpace = THREE.SRGBColorSpace;
    const roofMaterial = new THREE.MeshBasicMaterial({ map: roofTexture, toneMapped: false });
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    const draw = (seconds: number) => {
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(background, 0, 0);
      ctx.strokeStyle = "#3f3443";
      ctx.lineWidth = 2.3;
      ctx.lineCap = "round";
      for (let i = 0; i < 5; i++) {
        const x = ((seconds * 30 + i * 62) % 1450) - 200;
        const y = 170 + i * 20 + Math.sin(seconds * 0.6 + i) * 8;
        const wing = 4 + Math.sin(seconds * 5.2 + i) * 5;
        const span = 9 + i % 3 * 2;
        ctx.beginPath();
        ctx.moveTo(x - span, y - wing);
        ctx.quadraticCurveTo(x - span * 0.55, y - wing - 3, x, y);
        ctx.quadraticCurveTo(x + span * 0.55, y - wing - 3, x + span, y - wing);
        ctx.stroke();
      }
      texture.needsUpdate = true;
    };
    draw(15);
    return { texture, material, roofTexture, roofMaterial, draw };
  }, []);
  const fanlight = useMemo(() => {
    const geometry = new THREE.CircleGeometry(Math.min(3.3, plan.width * 0.3), 48, 0, Math.PI);
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) - 0.5) * 2);
    return geometry;
  }, [plan.width]);
  const skylight = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(plan.width * 0.48, plan.depth);
    const uv = geometry.getAttribute("uv");
    // The roof looks up into the violet sky, rather than down toward the orange horizon.
    for (let i = 0; i < uv.count; i++) uv.setY(i, 0.5 + uv.getY(i) * 0.5);
    return geometry;
  }, [plan.width, plan.depth]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const started = performance.now();
    const update = () => {
      clearInterval(timer);
      if (document.hidden || reducedMotion.matches) return;
      timer = setInterval(() => {
        if (control.current.target.kind !== "overview") return;
        sky.draw((performance.now() - started) / 1000 + 15);
        invalidate();
      }, 100);
    };
    update();
    document.addEventListener("visibilitychange", update);
    reducedMotion.addEventListener("change", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      reducedMotion.removeEventListener("change", update);
    };
  }, [control, invalidate, sky]);
  useEffect(() => () => {
    sky.material.dispose();
    sky.texture.dispose();
    sky.roofMaterial.dispose();
    sky.roofTexture.dispose();
  }, [sky]);
  useEffect(() => () => fanlight.dispose(), [fanlight]);
  useEffect(() => () => skylight.dispose(), [skylight]);

  const fanY = 4.97 + (plan.rows - 1) * HALL.levelH;
  return <group>
    <mesh position={[0, fanY, -plan.depth / 2 + 0.05]} geometry={fanlight} material={sky.material} />
    <mesh position={[0, plan.springY + 1.42, 0]} rotation={[Math.PI / 2, 0, 0]} geometry={skylight} material={sky.roofMaterial} />
  </group>;
}
