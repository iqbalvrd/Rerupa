"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { COLORS, GRASS, STATUE } from "./landing-config";
import { getRoadCurve } from "./scene-utils";
import { useTravel } from "./travel-state";

/**
 * Instanced swaying grass (LANDING_SPEC §4.8): 5-vertex blades, dark base to a
 * per-blade light green tip, wind weighted by height², fading into the fog.
 * Keeps clear of the path and both statue spots.
 */
export function Grass({ count }: { count: number }) {
  const travel = useTravel();
  const built = useMemo(() => {
    const H = GRASS.bladeHeight;
    const blade = new THREE.BufferGeometry();
    blade.setAttribute("position", new THREE.Float32BufferAttribute([-0.06, 0, 0, 0.06, 0, 0, -0.04, 0.35, 0, 0.04, 0.35, 0, 0, H, 0], 3));
    blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    const uniforms = {
      uTime: { value: 0 },
      uFog: { value: new THREE.Color(COLORS.horizon) },
      uFadeNear: { value: GRASS.fadeNear },
      uFadeFar: { value: GRASS.fadeFar },
    };
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms,
      vertexShader: /* glsl */ `uniform float uTime; varying float vH; varying float vDist; varying vec3 vTint;
        attribute vec3 tint;
        void main(){ vec3 p = position; vH = p.y / ${H.toFixed(2)}; vTint = tint;
          vec4 wp = modelMatrix * instanceMatrix * vec4(p,1.0);
          float w = sin(uTime*1.6 + wp.x*0.35 + wp.z*0.25) * 0.12 + sin(uTime*3.1 + wp.x*1.3) * 0.03;
          wp.x += w * vH * vH; wp.z += w * 0.5 * vH * vH;
          vec4 mv = viewMatrix * wp; vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform vec3 uFog; uniform float uFadeNear; uniform float uFadeFar; varying float vH; varying float vDist; varying vec3 vTint;
        void main(){ vec3 base = vec3(0.16,0.30,0.10);
          vec3 c = mix(base, vTint, smoothstep(0.0,1.0,vH));
          c = mix(c, uFog, smoothstep(uFadeNear, uFadeFar, vDist));
          gl_FragColor = vec4(c,1.0);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.InstancedMesh(blade, mat, count);
    const tint = new Float32Array(count * 3);
    const dummy = new THREE.Object3D();
    const road = getRoadCurve();
    const samples = Array.from({ length: 121 }, (_, i) => road.getPointAt(i / 120));
    const clear2 = GRASS.pathClearance ** 2;
    const nearStatue = (x: number, z: number) =>
      [STATUE.desktop, STATUE.portrait].some(
        ([sx, , sz]) => Math.abs(x - sx) < GRASS.statueClearance && Math.abs(z - sz) < GRASS.statueClearance,
      );
    let n = 0;
    let guard = 0;
    while (n < count && guard++ < count * 4) {
      const x = (Math.random() - 0.5) * GRASS.areaHalfX * 2;
      const z = GRASS.zFrom - Math.random() * GRASS.zDepth;
      if (samples.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < clear2)) continue;
      if (nearStatue(x, z)) continue;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      const s = GRASS.scaleMin + Math.random() * GRASS.scaleRange;
      dummy.scale.set(s, s * (0.5 + Math.random() * 0.5), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      const k = Math.random();
      tint.set([0.42 + k * 0.2, 0.62 + k * 0.1, 0.22 + k * 0.06], n * 3);
      n++;
    }
    mesh.count = n;
    blade.setAttribute("tint", new THREE.InstancedBufferAttribute(tint, 3));
    mesh.frustumCulled = false;
    return { mesh, uniforms, blade, mat };
  }, [count]);
  useEffect(
    () => () => {
      built.blade.dispose();
      built.mat.dispose();
      built.mesh.dispose();
    },
    [built],
  );

  useFrame(({ clock }) => {
    if (!travel.reduceMotion) built.uniforms.uTime.value = clock.getElapsedTime();
  });

  return <primitive object={built.mesh} />;
}
