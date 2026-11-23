"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { COLORS, SKY } from "./landing-config";
import { canvasTexture } from "./scene-utils";
import { useTravel } from "./travel-state";

/** Gradient sky dome with a soft sun glow, plus slow drifting clouds (LANDING_SPEC §4.2). */
export function Sky() {
  const travel = useTravel();
  const { dome, clouds, dispose } = useMemo(() => {
    const geo = new THREE.SphereGeometry(SKY.radius, 48, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(COLORS.skyTop) },
        mid: { value: new THREE.Color(COLORS.skyMid) },
        low: { value: new THREE.Color(COLORS.horizon) },
        sunDir: { value: new THREE.Vector3(...SKY.sunDir).normalize() },
        sunColor: { value: new THREE.Vector3(...COLORS.sunGlow) },
      },
      vertexShader: /* glsl */ `varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y,0.0,1.0);
          vec3 c = mix(low, mid, smoothstep(0.0,0.22,h)); c = mix(c, top, smoothstep(0.22,0.75,h));
          float s = max(dot(normalize(vDir), sunDir),0.0);
          c += sunColor * (pow(s,24.0)*0.9 + pow(s,4.0)*0.18);
          gl_FragColor = vec4(c,1.0);
          #include <colorspace_fragment>
        }`,
    });
    const dome = new THREE.Mesh(geo, mat);

    const tex = canvasTexture(256, 128, (g) => {
      for (let i = 0; i < 7; i++) {
        const x = 40 + i * 30 + Math.sin(i) * 10;
        const y = 70 + Math.cos(i * 1.7) * 12;
        const r = 34 + (i % 3) * 10;
        const gr = g.createRadialGradient(x, y, 2, x, y, r);
        gr.addColorStop(0, `rgba(${COLORS.cloud},0.85)`);
        gr.addColorStop(1, `rgba(${COLORS.cloud},0)`);
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, r, 0, 7);
        g.fill();
      }
    });
    const clouds = SKY.clouds.map(([x, y, z, s]) => {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthWrite: false, opacity: SKY.cloudOpacity }),
      );
      sp.position.set(x, y, z);
      sp.scale.set(s, s / 2, 1);
      return sp;
    });
    return {
      dome,
      clouds,
      dispose: () => {
        geo.dispose();
        mat.dispose();
        tex.dispose();
        clouds.forEach((c) => c.material.dispose());
      },
    };
  }, []);
  useEffect(() => dispose, [dispose]);

  useFrame((_, delta) => {
    if (travel.reduceMotion) return;
    const dt = Math.min(delta, 0.05);
    clouds.forEach((c, i) => {
      c.position.x += (0.6 + i * 0.2) * dt;
      if (c.position.x > SKY.cloudWrapX) c.position.x = -SKY.cloudWrapX;
    });
  });

  return (
    <>
      <primitive object={dome} />
      {clouds.map((c, i) => (
        <primitive key={i} object={c} />
      ))}
    </>
  );
}
