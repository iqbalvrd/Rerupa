"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { COLORS, GRASS, PATH, STATUE } from "./landing-config";
import { getRoadCurve, seededRandom } from "./scene-utils";
import { useTravel } from "./travel-state";

function bladeGeometry() {
  const height = GRASS.bladeHeight;
  const blade = new THREE.BufferGeometry();
  blade.setAttribute("position", new THREE.Float32BufferAttribute([
    -0.034, 0, 0, 0.034, 0, 0,
    -0.029, height * 0.36, 0.015, 0.029, height * 0.36, 0.015,
    -0.018, height * 0.73, 0.068, 0.018, height * 0.73, 0.068,
    0, height, 0.17,
  ], 3));
  blade.setAttribute("uv", new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 0, 0.36, 1, 0.36, 0, 0.73, 1, 0.73, 0.5, 1,
  ], 2));
  blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6]);
  return blade;
}

/** Short, curved blades, with the densest coverage along the visitor's approach. */
export function Grass({ count }: { count: number }) {
  const travel = useTravel();
  const built = useMemo(() => {
    const blade = bladeGeometry();
    const uniforms = {
      uTime: { value: 0 },
      uFog: { value: new THREE.Color(COLORS.horizon) },
      uFadeNear: { value: GRASS.fadeNear },
      uFadeFar: { value: GRASS.fadeFar },
    };
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms,
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute vec3 variation;
        varying vec2 vBlade;
        varying vec3 vVariation;
        varying float vLight;
        varying float vDist;

        void main() {
          vBlade = uv;
          vVariation = variation;
          float bend = uv.y * uv.y;
          vec3 p = position;
          p.x += (variation.z - 0.5) * 0.13 * bend;
          p.z *= 0.55 + variation.z * 0.9;

          vec4 root = modelMatrix * instanceMatrix[3];
          vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
          float gust = sin(uTime * 1.5 + root.x * 0.34 + root.z * 0.22);
          float flutter = sin(uTime * 2.6 + root.z * 1.2 + variation.z * 6.28);
          wp.xz += vec2(0.065, 0.035) * (gust + 0.22 * flutter) * bend;
          vec3 bladeNormal = normalize((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
          vLight = abs(dot(bladeNormal, normalize(vec3(-0.6, 0.0, 0.8))));
          vec4 mv = viewMatrix * wp;
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uFog;
        uniform float uFadeNear;
        uniform float uFadeFar;
        varying vec2 vBlade;
        varying vec3 vVariation;
        varying float vLight;
        varying float vDist;

        void main() {
          vec3 root = vec3(0.052, 0.098, 0.026);
          vec3 tip = mix(vec3(0.16, 0.28, 0.06), vec3(0.31, 0.39, 0.105), vVariation.x);
          vec3 color = mix(root, tip, smoothstep(0.02, 0.94, vBlade.y));
          float grain = sin(vBlade.y * 85.0 + vVariation.z * 31.0);
          float detail = 1.0 - smoothstep(6.0, 18.0, vDist);
          float crease = 1.0 - smoothstep(0.0, 0.23, abs(vBlade.x - 0.46));
          color *= (0.83 + 0.18 * vLight) * vVariation.y;
          color *= 1.0 + detail * (0.045 * grain + 0.11 * crease) * vBlade.y;
          color = mix(color, uFog, smoothstep(uFadeNear, uFadeFar, vDist));
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    const mesh = new THREE.InstancedMesh(blade, mat, count);
    const variation = new Float32Array(count * 3);
    const dummy = new THREE.Object3D();
    const rng = seededRandom(437);
    const road = getRoadCurve();
    const samples = Array.from({ length: 101 }, (_, i) => road.getPointAt(i / 100));
    const clear2 = (PATH.halfWidth + PATH.edgeWidth + 0.12) ** 2;
    const nearStatue = (x: number, z: number) =>
      [STATUE.desktop, STATUE.portrait].some(
        ([sx, , sz]) => Math.abs(x - sx) < GRASS.statueClearance && Math.abs(z - sz) < GRASS.statueClearance,
      );
    let n = 0;
    for (let tries = 0; n < count && tries < count * 4; tries++) {
      const near = rng() < 0.72;
      const x = (rng() * 2 - 1) * (near ? GRASS.nearHalfX : GRASS.areaHalfX);
      const z = GRASS.zFrom - rng() * (near ? GRASS.nearDepth : GRASS.zDepth);
      if (nearStatue(x, z) || samples.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < clear2)) continue;

      const patch = 0.5 + 0.28 * Math.sin(x * 0.82 + z * 1.1) * Math.cos(z * 0.68) +
        0.19 * Math.sin(x * 1.9 - z * 0.73);
      const height = 0.43 + rng() * 0.53 + patch * 0.32;
      const width = 0.47 + rng() * 0.66;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      dummy.scale.set(width, height, 0.75 + rng() * 0.55);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      variation.set([rng() * 0.67 + patch * 0.33, 0.78 + patch * 0.32 + rng() * 0.18, rng()], n * 3);
      n++;
    }
    mesh.count = n;
    blade.setAttribute("variation", new THREE.InstancedBufferAttribute(variation, 3));
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
