"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { COLORS, PATH } from "./landing-config";
import { canvasTexture, getRoadCurve, solid } from "./scene-utils";

/** Flat ribbon that follows `curve` on the ground, offset `offA..offB` to its side. */
function ribbon(curve: THREE.Curve<THREE.Vector3>, offA: number, offB: number, y: number, vScale: number) {
  const N = PATH.segments;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const len = curve.getLength();
  for (let i = 0; i <= N; i++) {
    const p = curve.getPointAt(i / N);
    const t = curve.getTangentAt(i / N);
    const n = new THREE.Vector3(-t.z, 0, t.x).normalize();
    pos.push(p.x + n.x * offA, y, p.z + n.z * offA, p.x + n.x * offB, y, p.z + n.z * offB);
    const v = ((i / N) * len) / vScale;
    uv.push(0, v, Math.abs(offB - offA) / vScale, v);
    if (i < N) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Curved stone path with thin seams and a raised edge on both sides (LANDING_SPEC §4.6). */
export function Path() {
  const maxAniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  const built = useMemo(() => {
    const curve = getRoadCurve();
    const tex = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = COLORS.road;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(150,130,105,0.22)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, 0.5);
      g.lineTo(w, 0.5);
      g.moveTo(w / 2, 0);
      g.lineTo(w / 2, h);
      g.moveTo(0, h / 2);
      g.lineTo(w, h / 2);
      g.stroke();
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAniso;
    const hw = PATH.halfWidth;
    const e = PATH.edgeWidth;
    return {
      tex,
      road: { geo: ribbon(curve, hw, -hw, 0.05, 2.5), mat: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }) },
      edgeMat: solid(COLORS.roadEdge, 0.9),
      edges: [ribbon(curve, hw, hw + e, 0.08, 2), ribbon(curve, -hw, -hw - e, 0.08, 2)],
    };
  }, [maxAniso]);
  useEffect(
    () => () => {
      built.tex.dispose();
      built.road.geo.dispose();
      built.road.mat.dispose();
      built.edgeMat.dispose();
      built.edges.forEach((g) => g.dispose());
    },
    [built],
  );

  return (
    <>
      <mesh geometry={built.road.geo} material={built.road.mat} receiveShadow />
      {built.edges.map((g, i) => (
        <mesh key={i} geometry={g} material={built.edgeMat} receiveShadow />
      ))}
    </>
  );
}

/** Painted grass ground under everything (LANDING_SPEC §4.8). */
export function Ground() {
  const built = useMemo(() => {
    const tex = canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = COLORS.ground;
      g.fillRect(0, 0, w, h);
      // Seeded, so the ground looks the same on every visit.
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      for (let i = 0; i < 260; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const r = 20 + rnd() * 60;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        const c = rnd() < 0.5 ? "104,140,72" : "150,184,98";
        gr.addColorStop(0, `rgba(${c},0.35)`);
        gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(40, 40);
    return { tex, mat: new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }) };
  }, []);
  useEffect(
    () => () => {
      built.tex.dispose();
      built.mat.dispose();
    },
    [built],
  );
  return (
    <mesh rotation-x={-Math.PI / 2} material={built.mat} receiveShadow>
      <planeGeometry args={[600, 600]} />
    </mesh>
  );
}
