"use client";

/**
 * Landing 3D scene: the front yard of Museum Nasional (Gedung Gajah) at dusk,
 * seen from a low title-screen angle (LANDING_SPEC.md). Ported from
 * docs/landing/landing_prototype_v3.html; every number is in landing-config.ts.
 *
 * Loaded with next/dynamic (ssr: false) by <Landing>.
 */
import { Canvas, useThree } from "@react-three/fiber";
import { Component, Suspense, useCallback, useEffect, useRef, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Birds } from "./birds";
import { CameraRig } from "./camera-rig";
import { Door } from "./door";
import { Grass } from "./grass";
import { CAMERA, COLORS, FOG, LIGHTS, RENDERER, STATUE } from "./landing-config";
import { Museum } from "./museum";
import { Nature } from "./nature";
import { Ground, Path } from "./path";
import { Sky } from "./sky";
import { StatueFigure, StatuePedestal } from "./statue";
import { TravelContext, type TravelState } from "./travel-state";

type Props = {
  travel: TravelState;
  grassCount: number;
  /** Max device pixel ratio (1 on weak phones, 1.5 otherwise). */
  maxDpr: number;
  /** MSAA on the default framebuffer; off on high-DPR screens (RENDERER.msaaBelowDpr). */
  antialias: boolean;
  whiteRef: RefObject<HTMLDivElement | null>;
  onLoaded: () => void;
  onEnter: () => void;
  onArrive: () => void;
};

export default function LandingScene({ travel, grassCount, maxDpr, antialias, whiteRef, onLoaded, onEnter, onArrive }: Props) {
  const settled = useRef({ statue: false, plants: false });
  const onStatueSettled = useCallback(() => {
    settled.current.statue = true;
    if (settled.current.plants) onLoaded();
  }, [onLoaded]);
  const onPlantsSettled = useCallback(() => {
    settled.current.plants = true;
    if (settled.current.statue) onLoaded();
  }, [onLoaded]);

  return (
    <Canvas
      aria-label="Halaman depan Museum Nasional (Gedung Gajah) saat senja, dengan patung gajah di halaman"
      role="img"
      dpr={[1, maxDpr]}
      shadows={{ type: THREE.PCFShadowMap }}
      frameloop={travel.reduceMotion ? "demand" : "always"}
      camera={{ fov: CAMERA.fov.landscape, near: CAMERA.near, far: CAMERA.far, position: CAMERA.path[0] }}
      gl={{ antialias, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = RENDERER.exposure;
      }}
      style={{ position: "fixed", inset: 0 }}
    >
      <TravelContext.Provider value={travel}>
        <fog attach="fog" args={[COLORS.horizon, FOG.near, FOG.far]} />
        <SoftEnvironment />
        <hemisphereLight args={[COLORS.hemiSky, COLORS.hemiGround, LIGHTS.hemiIntensity]} />
        <Sun />
        <Sky />
        <Ground />
        <Museum />
        <Door onEnter={onEnter} />
        <Path />
        <Grass count={grassCount} />
        <Birds />
        <PortraitAware>
          {(portrait) => (
            <group position={portrait ? STATUE.portrait : STATUE.desktop}>
              <StatuePedestal />
              <Suspense fallback={null}>
                <LoadGuard asset="statue" onSettled={onStatueSettled}>
                  <StatueFigure />
                </LoadGuard>
              </Suspense>
            </group>
          )}
        </PortraitAware>
        <Suspense fallback={null}>
          <LoadGuard asset="plants" onSettled={onPlantsSettled}>
            <Nature />
          </LoadGuard>
        </Suspense>
        <CameraRig whiteRef={whiteRef} onArrive={onArrive} />
      </TravelContext.Provider>
    </Canvas>
  );
}

/** RoomEnvironment through PMREM, faint: only for the bronze's reflections (LANDING_SPEC §4.1). */
function SoftEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, RENDERER.envBlur).texture;
    scene.environment = env;
    scene.environmentIntensity = RENDERER.envIntensity;
    room.dispose();
    pmrem.dispose();
    return () => {
      scene.environment = null;
      env.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Sun() {
  const c = LIGHTS.shadowCamera;
  return (
    <directionalLight
      color={COLORS.sun}
      intensity={LIGHTS.sunIntensity}
      position={LIGHTS.sunPosition}
      castShadow
      shadow-mapSize={[LIGHTS.shadowMapSize, LIGHTS.shadowMapSize]}
      shadow-camera-left={c.left}
      shadow-camera-right={c.right}
      shadow-camera-top={c.top}
      shadow-camera-bottom={c.bottom}
      shadow-camera-near={c.near}
      shadow-camera-far={c.far}
      shadow-bias={LIGHTS.shadowBias}
      shadow-normalBias={LIGHTS.shadowNormalBias}
      shadow-radius={LIGHTS.shadowRadius}
    />
  );
}

function PortraitAware({ children }: { children: (portrait: boolean) => ReactNode }) {
  const portrait = useThree((s) => s.size.width / Math.max(1, s.size.height) < CAMERA.portraitAspect);
  return <>{children(portrait)}</>;
}

/** Once a model has mounted or failed, it no longer holds up the entry. */
function ModelReady({ onSettled, children }: { onSettled: () => void; children: ReactNode }) {
  useEffect(onSettled, [onSettled]);
  return <>{children}</>;
}

class LoadGuard extends Component<
  { asset: string; onSettled: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn(`[landing] ${this.props.asset} failed to load`, err);
    this.props.onSettled();
  }
  render() {
    return this.state.failed ? null : <ModelReady onSettled={this.props.onSettled}>{this.props.children}</ModelReady>;
  }
}
