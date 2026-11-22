"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { COLORS, PATH } from "./landing-config";
import { canvasTexture, getRoadCurve, seededRandom, solid } from "./scene-utils";

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

/** A seamless layer of mottled turf and fine leaf marks under the blades. */
export function Ground() {
  const maxAniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  const built = useMemo(() => {
    const tex = canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = COLORS.ground;
      g.fillRect(0, 0, w, h);
      const rng = seededRandom(7);
      const acrossTile = (x: number, y: number, radius: number, draw: (x: number, y: number) => void) => {
        draw(x, y);
        const dx = x < radius ? w : x > w - radius ? -w : 0;
        const dy = y < radius ? h : y > h - radius ? -h : 0;
        if (dx) draw(x + dx, y);
        if (dy) draw(x, y + dy);
        if (dx && dy) draw(x + dx, y + dy);
      };
      for (let i = 0; i < 120; i++) {
        const radius = 12 + rng() * 46;
        const tint = rng() < 0.55 ? "43,65,31" : "131,145,74";
        acrossTile(rng() * w, rng() * h, radius, (x, y) => {
          const spot = g.createRadialGradient(x, y, 0, x, y, radius);
          spot.addColorStop(0, `rgba(${tint},0.34)`);
          spot.addColorStop(1, `rgba(${tint},0)`);
          g.fillStyle = spot;
          g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        });
      }
      const leafColors = ["#364b2b", "#647b42", "#829453", "#a6a364", "#4c5c32"];
      g.globalAlpha = 0.31;
      g.lineWidth = 0.8;
      for (let i = 0; i < 16_000; i++) {
        g.strokeStyle = leafColors[Math.floor(rng() * leafColors.length)];
        const angle = rng() * Math.PI * 2;
        const length = 0.7 + rng() * 3.3;
        acrossTile(rng() * w, rng() * h, length, (x, y) => {
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
          g.stroke();
        });
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(72, 72);
    tex.anisotropy = maxAniso;
    return { tex, mat: new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }) };
  }, [maxAniso]);
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
