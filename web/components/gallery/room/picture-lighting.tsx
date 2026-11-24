"use client";

import { useEffect, useMemo, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RoomPlan } from "./plan";
import type { RoomControl } from "./room-scene";

/** Reuse six lights even if the collection grows. Nearby paintings receive physical illumination. */
export function PictureSpotlights({ plan, sizes, control }: {
  plan: RoomPlan;
  sizes: { w: number; h: number }[];
  control: RefObject<RoomControl>;
}) {
  const lights = useMemo(() => Array.from({ length: Math.min(6, plan.slots.length) }, () => {
    const light = new THREE.SpotLight("#ffdab1", 3.8, 5, 0.78, 0.85, 2);
    const target = new THREE.Object3D();
    light.target = target;
    return { light, target };
  }), [plan.slots.length]);
  const offsets = useMemo(() => ({ source: new THREE.Vector3(), target: new THREE.Vector3() }), []);
  useEffect(() => () => lights.forEach(({ light }) => light.dispose()), [lights]);

  useFrame(({ camera }) => {
    const selected = control.current.target;
    const nearest = plan.slots.map(slot => ({
      slot,
      distance: selected.kind === "slot" && selected.index === slot.index ? -1 :
        (camera.position.x - slot.center[0]) ** 2 +
        (camera.position.y - slot.center[1]) ** 2 +
        (camera.position.z - slot.center[2]) ** 2,
    })).sort((a, b) => a.distance - b.distance);
    lights.forEach(({ light, target }, i) => {
      const slot = nearest[i]?.slot;
      const size = slot && sizes[slot.index];
      if (!slot || !size) { light.visible = false; return; }
      light.visible = true;
      offsets.source.set(0, size.h / 2 + 0.5, 0.5).applyAxisAngle(THREE.Object3D.DEFAULT_UP, slot.rotation);
      offsets.target.set(0, 0.08, 0.06).applyAxisAngle(THREE.Object3D.DEFAULT_UP, slot.rotation);
      light.position.set(...slot.center).add(offsets.source);
      target.position.set(...slot.center).add(offsets.target);
      light.updateMatrixWorld();
      target.updateMatrixWorld();
    });
  });
  return <group>{lights.map(({ light, target }, i) => <group key={i}>
    <primitive object={target} />
    <primitive object={light} />
  </group>)}</group>;
}

/** Low-poly scattering volume with soft edges, brightest beside the lens. */
export function PictureBeam({ height }: { height: number }) {
  const beam = useMemo(() => {
    const source = new THREE.Vector3(0, height / 2 + 0.5, 0.5);
    const direction = new THREE.Vector3(0, height / 2 + 0.08, 0.32).sub(source);
    const length = direction.length();
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction.normalize());
    const geometry = new THREE.CylinderGeometry(0.045, 0.16, length, 20, 1, true);
    geometry.translate(0, -length / 2, 0);
    geometry.applyQuaternion(rotation);
    geometry.translate(source.x, source.y, source.z);
    const material = new THREE.ShaderMaterial({
      uniforms: { lightColor: { value: new THREE.Color("#ffd7a4") } },
      vertexShader: `
        varying vec2 beamUv;
        varying float wallDistance;
        varying vec3 viewNormal;
        varying vec3 viewPosition;
        void main() {
          beamUv = uv;
          wallDistance = position.z;
          viewNormal = normalize(normalMatrix * normal);
          vec4 positionInView = modelViewMatrix * vec4(position, 1.0);
          viewPosition = -positionInView.xyz;
          gl_Position = projectionMatrix * positionInView;
        }
      `,
      fragmentShader: `
        uniform vec3 lightColor;
        varying vec2 beamUv;
        varying float wallDistance;
        varying vec3 viewNormal;
        varying vec3 viewPosition;
        void main() {
          float edge = abs(dot(normalize(viewNormal), normalize(viewPosition)));
          float fade = pow(beamUv.y, 1.5) * (1.0 - smoothstep(0.92, 1.0, beamUv.y));
          float wallFade = smoothstep(0.15, 0.32, wallDistance);
          float alpha = 0.18 * fade * pow(edge, 1.6) * wallFade;
          if (wallDistance < 0.16 || alpha < 0.001) discard;
          gl_FragColor = vec4(lightColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geometry, material };
  }, [height]);
  useEffect(() => () => { beam.geometry.dispose(); beam.material.dispose(); }, [beam]);
  return <mesh geometry={beam.geometry} material={beam.material} userData={{ cannotReceiveAO: true }} renderOrder={2} />;
}
