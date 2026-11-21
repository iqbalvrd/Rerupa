"use client";

/**
 * 3D gallery room drawn behind the HTML frames (React Three Fiber).
 *
 * Stylized after the renovated Museum Nasional galleries: cream walls with
 * pilasters on grey marble plinths, honey wood ceiling beams resting on the
 * pilasters, a black light track, high grey-framed windows, and a warm oak
 * plank floor. Same art direction as the landing: smooth solid materials,
 * warm light, no photo textures except the wood floor.
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
import { Suspense, useEffect, useMemo, type RefObject } from "react";
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
  wall: "#f4efe5",
  trim: "#fffbf3",
  marble: "#c9c6c0",
  marbleDark: "#a9a6a0",
  rail: "#4a4d50",
  beam: "#c08a52",
  ceiling: "#f6f2ea",
  windowFrame: "#5d656e",
  glass: "#eef3f4",
  track: "#1d1d1f",
};

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
      gl={{ antialias: true, powerPreference: "low-power" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.0;
      }}
      style={{ position: "absolute", inset: 0 }}
    >
      <Suspense fallback={null}>
        <Scene trackRef={trackRef} bayCount={bayCount} />
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

  // Soft image-based light so rounded edges and the floor catch highlights.
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.45;
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
    camera.position.set(walk * bayW, CAM_Y, CAM_DIST);
    camera.rotation.set(0, 0, 0);
  });

  const first = -1; // one extra bay on each side so the ends never show the void
  const last = bayCount;
  const xMin = (first - 0.5) * bayW;
  const xMax = (last + 0.5) * bayW;
  const span = xMax - xMin;
  const midX = (xMin + xMax) / 2;
  const bays = useMemo(() => Array.from({ length: last - first + 1 }, (_, k) => first + k), [first, last]);
  const boundaries = useMemo(() => Array.from({ length: last - first + 2 }, (_, k) => first - 0.5 + k), [first, last]);

  return (
    <>
      {/* Low, slightly cool fill so the warm key light has something to contrast with. */}
      <hemisphereLight args={["#f3f1ff", "#8a6440", 0.5]} />
      {/* Warm late-afternoon key from the windows' side (upper left), casting the pilaster shadows. */}
      <directionalLight
        castShadow
        color="#ffdcae"
        intensity={2.6}
        position={[midX - 5, ROOM_H + 2.5, 7]}
        shadow-mapSize={[2048, 1024]}
        shadow-camera-left={-span / 2}
        shadow-camera-right={span / 2}
        shadow-camera-top={ROOM_H + 2}
        shadow-camera-bottom={-2}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      >
        <object3D attach="target" position={[midX, 0, 0]} />
      </directionalLight>
      {/* Cool bounce from the right, no shadows. */}
      <directionalLight color="#cfdcff" intensity={0.35} position={[midX + 6, 2, 6]} />

      <AmbientShading midX={midX} span={span} />

      {/* Back wall */}
      <mesh position={[midX, ROOM_H / 2, 0]} receiveShadow>
        <planeGeometry args={[span, ROOM_H]} />
        <meshStandardMaterial color={C.wall} roughness={0.9} />
      </mesh>

      {/* Crown molding, dado rail, baseboard */}
      <mesh position={[midX, ROOM_H - 0.16, 0.09]} castShadow receiveShadow>
        <boxGeometry args={[span, 0.32, 0.18]} />
        <meshStandardMaterial color={C.trim} roughness={0.7} />
      </mesh>
      <mesh position={[midX, 0.48, 0.04]} castShadow>
        <boxGeometry args={[span, 0.07, 0.08]} />
        <meshStandardMaterial color={C.rail} roughness={0.5} />
      </mesh>
      <mesh position={[midX, 0.11, 0.03]} receiveShadow>
        <boxGeometry args={[span, 0.22, 0.06]} />
        <meshStandardMaterial color={C.trim} roughness={0.7} />
      </mesh>

      {boundaries.map((b) => (
        <Pilaster key={`p${b}`} x={b * bayW} />
      ))}
      {bays.map((i) => (
        <BayDetails key={`b${i}`} x={i * bayW} bayW={bayW} />
      ))}

      <Ceiling midX={midX} span={span} boundaries={boundaries} bayW={bayW} />
      <Floor midX={midX} span={span} />
    </>
  );
}

/**
 * Baked-looking soft shading (cheap stand-in for ambient occlusion): darker
 * under the crown molding and along the floor, so the wall reads as a lit
 * volume instead of a flat card.
 */
function AmbientShading({ midX, span }: { midX: number; span: number }) {
  const fade = useFadeTexture();
  return (
    <group>
      {/* under the crown molding: opaque at the top, fading down */}
      <mesh position={[midX, ROOM_H - 0.32 - 0.6, 0.004]}>
        <planeGeometry args={[span, 1.2]} />
        <meshBasicMaterial map={fade} transparent depthWrite={false} color="#4a3520" opacity={0.22} />
      </mesh>
      {/* above the baseboard: opaque at the bottom, fading up */}
      <mesh position={[midX, 0.22 + 0.45, 0.004]} rotation={[0, 0, Math.PI]}>
        <planeGeometry args={[span, 0.9]} />
        <meshBasicMaterial map={fade} transparent depthWrite={false} color="#4a3520" opacity={0.16} />
      </mesh>
    </group>
  );
}

function Pilaster({ x }: { x: number }) {
  const w = 0.5;
  const fade = useFadeTexture();
  return (
    <group position={[x, 0, 0]}>
      {/* contact shading on the wall beside the pilaster */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (w / 2 + 0.22), ROOM_H / 2, 0.003]} rotation={[0, 0, (side * Math.PI) / 2]}>
          <planeGeometry args={[ROOM_H, 0.44]} />
          <meshBasicMaterial map={fade} transparent depthWrite={false} color="#4a3520" opacity={0.14} />
        </mesh>
      ))}
      <RoundedBox args={[w, ROOM_H, 0.24]} radius={0.03} smoothness={2} position={[0, ROOM_H / 2, 0.12]} castShadow receiveShadow>
        <meshStandardMaterial color={C.trim} roughness={0.75} />
      </RoundedBox>
      {/* capital */}
      <RoundedBox args={[w + 0.16, 0.22, 0.34]} radius={0.03} smoothness={2} position={[0, ROOM_H - 0.43, 0.17]} castShadow>
        <meshStandardMaterial color={C.trim} roughness={0.7} />
      </RoundedBox>
      {/* grey marble plinth */}
      <RoundedBox args={[w + 0.14, 0.78, 0.36]} radius={0.025} smoothness={2} position={[0, 0.39, 0.18]} castShadow receiveShadow>
        <meshStandardMaterial color={C.marble} roughness={0.35} metalness={0.05} />
      </RoundedBox>
      <mesh position={[0, 0.8, 0.18]}>
        <boxGeometry args={[w + 0.18, 0.05, 0.38]} />
        <meshStandardMaterial color={C.marbleDark} roughness={0.4} />
      </mesh>
    </group>
  );
}

function BayDetails({ x, bayW }: { x: number; bayW: number }) {
  const spot = useSpotTexture();
  const fade = useFadeTexture();
  // Two high windows per bay, like the clerestory in the reference photo.
  // They sit just under the crown molding so the artwork frame never covers them.
  const winW = Math.min(0.62, bayW * 0.16);
  const winH = 0.46;
  const winY = ROOM_H - 0.64;
  const offsets = [-0.3 * bayW, 0.3 * bayW];
  return (
    <group position={[x, 0, 0]}>
      {/* warm pool of light from the track spot onto the wall around the frame */}
      <mesh position={[0, CAM_Y + 0.9, 0.005]}>
        <planeGeometry args={[Math.min(bayW * 0.95, 5), 4.6]} />
        <meshBasicMaterial map={spot} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} opacity={0.45} color="#ffdcae" />
      </mesh>
      {/* the lit wall reflected softly in the polished floor */}
      <mesh position={[0, 0.004, 1.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[Math.min(bayW * 0.7, 3.6), 2.4]} />
        <meshBasicMaterial map={spot} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} opacity={0.14} color="#ffd29a" />
      </mesh>
      {offsets.map((ox) => (
        <group key={ox} position={[ox, winY, 0.01]}>
          {/* daylight falling from the window down the wall, slanted by the low sun */}
          <mesh position={[0.32, -(winH / 2 + 1.15), -0.004]} rotation={[0, 0, -0.26]}>
            <planeGeometry args={[winW * 1.1, 2.3]} />
            <meshBasicMaterial map={fade} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} opacity={0.13} color="#ffe6c2" />
          </mesh>
          <mesh castShadow>
            <boxGeometry args={[winW + 0.08, winH + 0.08, 0.06]} />
            <meshStandardMaterial color={C.windowFrame} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0, 0.032]}>
            <planeGeometry args={[winW, winH]} />
            <meshBasicMaterial color={C.glass} toneMapped={false} />
          </mesh>
          {/* mullions: 2 x 2 panes */}
          <mesh position={[0, 0, 0.035]}>
            <boxGeometry args={[0.025, winH, 0.01]} />
            <meshStandardMaterial color={C.windowFrame} />
          </mesh>
          <mesh position={[0, 0, 0.035]}>
            <boxGeometry args={[winW, 0.025, 0.01]} />
            <meshStandardMaterial color={C.windowFrame} />
          </mesh>
        </group>
      ))}
      {/* spot fixture on the track, aimed at the frame */}
      <group position={[0, ROOM_H - 0.1, 0.9]} rotation={[0.9, 0, 0]}>
        <mesh>
          <cylinderGeometry args={[0.045, 0.055, 0.16, 16]} />
          <meshStandardMaterial color={C.track} roughness={0.4} metalness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

function Ceiling({ midX, span, boundaries, bayW }: { midX: number; span: number; boundaries: number[]; bayW: number }) {
  const depth = 12;
  return (
    <group>
      <mesh position={[midX, ROOM_H, depth / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[span, depth]} />
        <meshStandardMaterial color={C.ceiling} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {/* wood beams resting on the pilasters, running toward the viewer */}
      {boundaries.map((b) => (
        <RoundedBox key={b} args={[0.32, 0.36, depth]} radius={0.03} smoothness={2} position={[b * bayW, ROOM_H - 0.18, depth / 2]} castShadow>
          <meshStandardMaterial color={C.beam} roughness={0.6} />
        </RoundedBox>
      ))}
      {/* black light track along the wall */}
      <mesh position={[midX, ROOM_H - 0.03, 0.9]}>
        <boxGeometry args={[span, 0.05, 0.06]} />
        <meshStandardMaterial color={C.track} roughness={0.5} />
      </mesh>
    </group>
  );
}

function Floor({ midX, span }: { midX: number; span: number }) {
  const depth = 14;
  const tex = useTexture("/gallery/floor-wood.webp");
  const map = useMemo(() => {
    const t = tex.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    const tile = 2.6; // meters per texture tile
    t.repeat.set(span / tile, depth / tile);
    t.needsUpdate = true;
    return t;
  }, [tex, span]);
  const shade = useFadeTexture();
  return (
    <group>
      <mesh position={[midX, 0, depth / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[span, depth]} />
        {/* lacquered oak: low roughness so the warm key light leaves a soft sheen */}
        <meshStandardMaterial map={map} roughness={0.34} metalness={0} envMapIntensity={1.2} />
      </mesh>
      {/* soft contact shadow where the floor meets the wall */}
      <mesh position={[midX, 0.002, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[span, 1]} />
        <meshBasicMaterial map={shade} transparent depthWrite={false} color="#3a2412" opacity={0.45} />
      </mesh>
    </group>
  );
}

// ── Procedural textures (no extra downloads) ────────────────────────────────

function useSpotTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(128, 110, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

/**
 * Fade for the floor strip at the wall. The canvas top maps to the strip's far
 * (wall) edge after the plane is laid flat, so: opaque at the top, clear below.
 */
function useFadeTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
    return new THREE.CanvasTexture(c);
  }, []);
}
