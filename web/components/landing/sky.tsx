"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { COLORS, SKY } from "./landing-config";
import { useTravel } from "./travel-state";

/** A sunset gradient and thin cloud bands within a single sky draw. */
export function Sky() {
  const travel = useTravel();
  const { dome, uniforms } = useMemo(() => {
    const uniforms = {
      top: { value: new THREE.Color(COLORS.skyTop) },
      mid: { value: new THREE.Color(COLORS.skyMid) },
      low: { value: new THREE.Color(COLORS.horizon) },
      litCloud: { value: new THREE.Color(COLORS.cloudLight) },
      shadedCloud: { value: new THREE.Color(COLORS.cloudShade) },
      sunDir: { value: new THREE.Vector3(...SKY.sunDir).normalize() },
      sunColor: { value: new THREE.Color(COLORS.sunGlow) },
      time: { value: 0 },
    };
    const geo = new THREE.SphereGeometry(SKY.radius, 48, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 top, mid, low, litCloud, shadedCloud, sunDir, sunColor;
        uniform float time;
        varying vec3 vDir;

        float hash(vec2 p) {
          vec3 a = fract(vec3(p.xyx) * 0.1031);
          a += dot(a, a.yzx + 33.33);
          return fract((a.x + a.y) * a.z);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 w = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), w.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), w.x), w.y);
        }

        void main() {
          vec3 dir = normalize(vDir);
          float h = max(dir.y, 0.0);
          float s = max(dot(dir, sunDir), 0.0);
          float warmth = pow(s, 6.0) * (1.0 - smoothstep(0.19, 0.53, h));
          vec3 color = mix(low, mid, smoothstep(0.005, 0.39, h));
          color = mix(color, top, smoothstep(0.20, 0.64, h));
          color = mix(color, sunColor, warmth * 0.56);
          color += sunColor * (pow(s, 48.0) * 0.18 + pow(s, 270.0) * 0.15);

          vec2 q = vec2(dir.x + dir.z * 0.28, h) * vec2(4.8, 17.0);
          q += vec2(4.1 - time * 0.012, 3.8);
          float coarse = noise2(q);
          float fine = noise2(q * 2.1 + vec2(1.6, 5.3));
          float detail = noise2(q * 4.35);
          float density = coarse * 0.63 + fine * 0.26 + detail * 0.11;
          float cloud = smoothstep(0.52, 0.76, density);
          cloud *= smoothstep(0.043, 0.16, h) * (1.0 - smoothstep(0.49, 0.84, h));
          float rim = smoothstep(0.48, 0.80, coarse);
          vec3 cloudColor = mix(shadedCloud, litCloud, 0.34 + 0.32 * rim + 0.30 * warmth);
          color = mix(color, cloudColor, cloud * 0.54);

          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    return { dome: new THREE.Mesh(geo, mat), uniforms };
  }, []);
  useEffect(() => () => {
    dome.geometry.dispose();
    dome.material.dispose();
  }, [dome]);

  useFrame(({ clock }) => {
    if (!travel.reduceMotion) uniforms.time.value = clock.getElapsedTime();
  });

  return <primitive object={dome} />;
}
