"use client";

/**
 * 3D gallery room drawn behind the HTML frames (React Three Fiber).
 *
 * Stylized after the renovated Museum Nasional galleries: cream walls with
 * pilasters on grey marble plinths, honey wood ceiling beams resting on the
 * pilasters, a black light track, high grey-framed windows, and a warm oak
 * plank floor.
 *
 * Shading follows the landing prototype (LANDING_SPEC §4): solid colours with
 * a little roughness, rounded edges that catch the light, ACES tone mapping,
 * a warm sun with soft PCF shadows, a hemisphere fill and a faint
 * RoomEnvironment for highlights. N8AO adds the contact shading in corners and
 * where parts meet, which is what keeps a clean scene from looking flat.
 *
 * Alignment contract with the HTML layer (gallery.module.css):
 * - The wall is the plane z = 0. One bay of wall is exactly one viewport wide,
 *   so HTML bays (which scroll 1:1 with the track) stay glued to the 3D wall.
 * - Wall top sits at --ceiling-h (9%) and the floor line at --floor-top (77%)
 *   of the canvas height, matching where the HTML bays are laid out.
 * The camera slides along x as the track scrolls; nearer things (floor,
 * beams) get real parallax. Frames render on demand, so an idle gallery costs
 * nothing.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox, useTexture } from "@react-three/drei";
import { EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Suspense, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// ── Layout (must match gallery.module.css) ──────────────────────────────────
const CEILING_FRAC = 0.09;
const FLOOR_FRAC = 0.77;
const VFOV = 50; // degrees
const VIEW_H = 7.5; // visible wall height at z = 0, in meters
const CAM_DIST = VIEW_H / (2 * Math.tan(THREE.MathUtils.degToRad(VFOV / 2)));
const CAM_Y = (FLOOR_FRAC - 0.5) * VIEW_H; // floor line lands at FLOOR_FRAC
const ROOM_H = CAM_Y + (0.5 - CEILING_FRAC) * VIEW_H; // wall top lands at CEILING_FRAC

// ── Palette (LANDING_SPEC §4.4 family) ──────────────────────────────────────
const C = {
  wall: "#f7f1e6",
  trim: "#fffbf3",
  marble: "#cfccc6",
  marbleTop: "#b7b3ad",
  rail: "#4d5156",
  beam: "#c4884d",
  ceiling: "#f8f4ec",
  windowFrame: "#626a73",
  glass: "#dde7ec",
  track: "#222326",
};

/** Shared materials: one instance each, like the landing's `S(color, rough)` helper. */
function useMaterials() {
  return useMemo(() => {
    const S = (color: string, roughness = 0.85, metalness = 0) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness });
    return {
      wall: S(C.wall, 0.92),
      trim: S(C.trim, 0.7),
      marble: S(C.marble, 0.35, 0.02),
      marbleTop: S(C.marbleTop, 0.4),
      rail: S(C.rail, 0.5),
      beam: S(C.beam, 0.62),
      ceiling: S(C.ceiling, 0.95),
      windowFrame: S(C.windowFrame, 0.55),
      glass: S(C.glass, 0.12),
      track: S(C.track, 0.45, 0.3),
    };
  }, []);
}
type Materials = ReturnType<typeof useMaterials>;

type RoomProps = {
  trackRef: RefObject<HTMLDivElement | null>;
  bayCount: number;
  onReady?: () => void;
};

export default function Room3D({ trackRef, bayCount, onReady }: RoomProps) {
  return (
    <Canvas
      aria-hidden="true"
      frameloop="demand"
      dpr={[1, 1.5]}
      shadows="percentage"
      camera={{ fov: VFOV, near: 0.1, far: 60, position: [0, CAM_Y, CAM_DIST] }}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
      style={{ position: "absolute", inset: 0 }}
    >
      <Suspense fallback={null}>
        <Scene trackRef={trackRef} bayCount={bayCount} />
        <EffectComposer multisampling={4} enableNormalPass={false}>
          {/* Contact shading in corners and joints. Half resolution keeps it light on phones. */}
          <N8AO halfRes quality="performance" aoRadius={0.9} distanceFalloff={0.6} intensity={2.2} color="#3a2a1c" />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
        <ReadySignal onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}

/** Mounts only after textures have loaded; tells the page once the first full frame is drawn. */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    const id = requestAnimationFrame(() => requestAnimationFrame(() => onReady?.()));
    return () => cancelAnimationFrame(id);
  }, [invalidate, onReady]);
  return null;
}

function Scene({ trackRef, bayCount }: Omit<RoomProps, "onReady">) {
  const { size, camera, invalidate, gl, scene } = useThree();
  const bayW = (VIEW_H * size.width) / Math.max(size.height, 1);
  const m = useMaterials();
  const sun = useRef<THREE.DirectionalLight>(null);

  // Faint image-based light for highlights on rounded edges, glass and the floor.
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    invalidate();
    return () => {
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, invalidate]);

  // Walk: camera x follows the track scroll. Redraw only when it moves.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => invalidate();
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, [trackRef, invalidate]);

  useFrame(() => {
    const track = trackRef.current;
    const walk = track && track.clientWidth ? track.scrollLeft / track.clientWidth : 0;
    const x = walk * bayW;
    camera.position.set(x, CAM_Y, CAM_DIST);
    camera.rotation.set(0, 0, 0);
    // The sun follows the camera so a small, sharp shadow map always covers the view.
    if (sun.current) {
      sun.current.position.set(x - 7, ROOM_H + 4, 9);
      sun.current.target.position.set(x, 1.5, 0);
      sun.current.target.updateMatrixWorld();
    }
  });

  const first = -1; // one extra bay on each side so the ends never show the void
  const last = bayCount;
  const xMin = (first - 0.5) * bayW;
  const xMax = (last + 0.5) * bayW;
  const span = xMax - xMin;
  const midX = (xMin + xMax) / 2;
  const bays = useMemo(() => Array.from({ length: last - first + 1 }, (_, k) => first + k), [first, last]);
  const boundaries = useMemo(() => Array.from({ length: last - first + 2 }, (_, k) => first - 0.5 + k), [first, last]);
  const shadowHalf = Math.max(bayW, 4) * 0.75;

  return (
    <>
      {/* Same recipe as the landing: hemisphere fill + warm sun with soft PCF shadows. */}
      <hemisphereLight args={["#fff3e8", "#a88660", 1.15]} />
      <directionalLight
        ref={sun}
        castShadow
        color="#ffe0bd"
        intensity={2.1}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-shadowHalf}
        shadow-camera-right={shadowHalf}
        shadow-camera-top={ROOM_H + 1}
        shadow-camera-bottom={-1}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
        shadow-radius={4}
      />

      {/* Back wall */}
      <mesh position={[midX, ROOM_H / 2, -0.05]} material={m.wall} receiveShadow>
        <boxGeometry args={[span, ROOM_H, 0.1]} />
      </mesh>

      {/* Crown molding: two stepped profiles */}
      <RBox m={m.trim} size={[span, 0.3, 0.16]} at={[midX, ROOM_H - 0.15, 0.08]} r={0.04} />
      <RBox m={m.trim} size={[span, 0.1, 0.26]} at={[midX, ROOM_H - 0.33, 0.13]} r={0.03} />
      {/* Dark rail and baseboard near the floor, as in the reference */}
      <RBox m={m.rail} size={[span, 0.07, 0.09]} at={[midX, 0.5, 0.045]} r={0.02} />
      <RBox m={m.trim} size={[span, 0.24, 0.07]} at={[midX, 0.12, 0.035]} r={0.025} />

      {boundaries.map((b) => (
        <Pilaster key={`p${b}`} x={b * bayW} m={m} />
      ))}
      {bays.map((i) => (
        <Windows key={`w${i}`} x={i * bayW} bayW={bayW} m={m} />
      ))}

      <Ceiling midX={midX} span={span} boundaries={boundaries} bays={bays} bayW={bayW} m={m} />
      <Floor midX={midX} span={span} />
    </>
  );
}

function RBox({
  m,
  size,
  at,
  r = 0.05,
  children,
}: {
  m: THREE.Material;
  size: [number, number, number];
  at: [number, number, number];
  r?: number;
  children?: ReactNode;
}) {
  const radius = Math.min(r, size[0] / 2 - 0.005, size[1] / 2 - 0.005, size[2] / 2 - 0.005);
  return (
    <RoundedBox args={size} radius={radius} smoothness={2} position={at} material={m} castShadow receiveShadow>
      {children}
    </RoundedBox>
  );
}

function Pilaster({ x, m }: { x: number; m: Materials }) {
  const w = 0.52;
  return (
    <group position={[x, 0, 0]}>
      <RBox m={m.trim} size={[w, ROOM_H, 0.24]} at={[0, ROOM_H / 2, 0.12]} r={0.05} />
      {/* capital: two steps under the crown */}
      <RBox m={m.trim} size={[w + 0.14, 0.18, 0.32]} at={[0, ROOM_H - 0.5, 0.16]} r={0.035} />
      <RBox m={m.trim} size={[w + 0.06, 0.08, 0.28]} at={[0, ROOM_H - 0.63, 0.14]} r={0.025} />
      {/* grey marble plinth with a darker cap */}
      <RBox m={m.marble} size={[w + 0.16, 0.8, 0.36]} at={[0, 0.4, 0.18]} r={0.04} />
      <RBox m={m.marbleTop} size={[w + 0.2, 0.06, 0.4]} at={[0, 0.83, 0.2]} r={0.02} />
    </group>
  );
}

/** Two high windows per bay, set into the wall with a sill, like the reference clerestory. */
function Windows({ x, bayW, m }: { x: number; bayW: number; m: Materials }) {
  const w = Math.min(0.62, bayW * 0.16);
  const h = 0.48;
  const y = ROOM_H - 0.66;
  const bar = 0.045;
  return (
    <group position={[x, 0, 0]}>
      {[-0.3 * bayW, 0.3 * bayW].map((ox) => (
        <group key={ox} position={[ox, y, 0.02]}>
          <mesh material={m.glass} position={[0, 0, -0.01]}>
            <planeGeometry args={[w, h]} />
          </mesh>
          {/* frame */}
          <RBox m={m.windowFrame} size={[w + bar * 2, bar, 0.07]} at={[0, h / 2 + bar / 2, 0.02]} r={0.015} />
          <RBox m={m.windowFrame} size={[w + bar * 2, bar, 0.07]} at={[0, -h / 2 - bar / 2, 0.02]} r={0.015} />
          <RBox m={m.windowFrame} size={[bar, h, 0.07]} at={[-w / 2 - bar / 2, 0, 0.02]} r={0.015} />
          <RBox m={m.windowFrame} size={[bar, h, 0.07]} at={[w / 2 + bar / 2, 0, 0.02]} r={0.015} />
          {/* mullions */}
          <RBox m={m.windowFrame} size={[0.022, h, 0.03]} at={[0, 0, 0.005]} r={0.008} />
          <RBox m={m.windowFrame} size={[w, 0.022, 0.03]} at={[0, 0, 0.005]} r={0.008} />
          {/* sill */}
          <RBox m={m.trim} size={[w + 0.2, 0.05, 0.12]} at={[0, -h / 2 - bar - 0.025, 0.06]} r={0.02} />
        </group>
      ))}
    </group>
  );
}

function Ceiling({
  midX,
  span,
  boundaries,
  bays,
  bayW,
  m,
}: {
  midX: number;
  span: number;
  boundaries: number[];
  bays: number[];
  bayW: number;
  m: Materials;
}) {
  const depth = 12;
  return (
    <group>
      <mesh position={[midX, ROOM_H + 0.05, depth / 2]} material={m.ceiling} receiveShadow>
        <boxGeometry args={[span, 0.1, depth]} />
      </mesh>
      {/* wood beams resting on the pilasters, running toward the viewer */}
      {boundaries.map((b) => (
        <RBox key={b} m={m.beam} size={[0.34, 0.38, depth]} at={[b * bayW, ROOM_H - 0.19, depth / 2]} r={0.04} />
      ))}
      {/* black light track along the wall, one small spot per bay */}
      <RBox m={m.track} size={[span, 0.05, 0.07]} at={[midX, ROOM_H - 0.025, 0.95]} r={0.015} />
      {bays.map((i) => (
        <mesh key={i} material={m.track} position={[i * bayW, ROOM_H - 0.13, 0.95]} rotation={[0.85, 0, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.055, 0.16, 16]} />
        </mesh>
      ))}
    </group>
  );
}

function Floor({ midX, span }: { midX: number; span: number }) {
  const depth = 14;
  const tex = useTexture("/gallery/floor-wood.webp");
  const material = useMemo(() => {
    const t = tex.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    const tile = 2.6; // meters per texture tile
    t.repeat.set(span / tile, depth / tile);
    t.needsUpdate = true;
    // Lacquered oak: a soft sheen from the environment, not a mirror.
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.4, metalness: 0, envMapIntensity: 1.1 });
  }, [tex, span]);
  return (
    <mesh position={[midX, 0, depth / 2]} rotation={[-Math.PI / 2, 0, 0]} material={material} receiveShadow>
      <planeGeometry args={[span, depth]} />
    </mesh>
  );
}
