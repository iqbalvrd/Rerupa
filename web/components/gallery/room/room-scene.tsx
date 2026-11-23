"use client";

/**
 * The 3D gallery room (React Three Fiber): a real room the visitor stands in,
 * entered through a lit doorway, with the collection hung around three walls.
 * The camera walks between poses like the landing's walk to the museum door
 * (ease-in-out, turning while it walks); nothing in the room moves.
 *
 * Paintings are textured planes in gilded frames, each lit by a soft wash from
 * a spot on the ceiling track, with a small museum label underneath. The HTML
 * layer on top holds one link per painting; this scene keeps each link over
 * its painting's on-screen rectangle (see `anchors`).
 *
 * Look follows the gallery's earlier room (cream walls, oak floor, honey wood
 * beams, black light track) and the landing's renderer recipe: ACES tone
 * mapping, a hemisphere fill, a faint RoomEnvironment and N8AO contact shading.
 * Frames render on demand: an idle room costs nothing.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox, useTexture } from "@react-three/drei";
import { EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { frameTexture } from "./frame-texture";
import {
  HALL,
  easeInOutCubic,
  entrancePose,
  fovFor,
  frameWidth,
  lerpPose,
  overviewPose,
  paintingSize,
  slotPose,
  walkSeconds,
  type Pose,
  type RoomPlan,
  type Slot,
} from "./plan";

export type Exhibit = { key: string; title: string } & ({ kind: "artwork"; src: string } | { kind: "upload" });

export type RoomTarget = { kind: "overview" } | { kind: "slot"; index: number };

/**
 * Mutable channel from the page to the camera. Set `target` and bump
 * `serial` to start a walk; `instant` jumps there; `fromDoorway` starts the
 * walk at the entrance (arriving from the landing). The scene fills in
 * `invalidate`.
 */
export type RoomControl = {
  target: RoomTarget;
  serial: number;
  instant: boolean;
  fromDoorway: boolean;
  /** Keep the walk from starting (the doorway's white light is still up). */
  hold: boolean;
  onArrive?: (target: RoomTarget) => void;
  invalidate?: () => void;
};

type Props = {
  plan: RoomPlan;
  exhibits: Exhibit[];
  control: RefObject<RoomControl>;
  anchors: RefObject<(HTMLElement | null)[]>;
  onReady?: () => void;
};

const C = {
  wall: "#d8c6a6",
  trim: "#ebe1cd",
  ceiling: "#f8f4ec",
  beam: "#c4884d",
  track: "#222326",
  marble: "#cfccc6",
  gold: "#c9a14a",
  goldDeep: "#8a6424",
  liner: "#2a2118",
  plaque: "#fffdf8",
  door: "#fff6e6",
  stone: "#d9d1c3",
  panel: "#d4c3a5",
  niche: "#c9b493",
  iron: "#3f4348",
  bronze: "#6e5130",
  glass: "#f1f5f7",
};

export default function RoomScene({ plan, exhibits, control, anchors, onReady }: Props) {
  return (
    <Canvas
      aria-hidden="true"
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ fov: 52, near: 0.05, far: 120, position: overviewPose(plan, 16 / 9).pos }}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
      style={{ position: "absolute", inset: 0 }}
    >
      <Suspense fallback={null}>
        <Lighting />
        <Shell plan={plan} />
        <Exhibits plan={plan} exhibits={exhibits} control={control} anchors={anchors} />
        <EffectComposer multisampling={4} enableNormalPass={false}>
          <N8AO halfRes quality="performance" aoRadius={0.8} distanceFalloff={0.6} intensity={2} color="#3a2a1c" />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
        <ReadySignal onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}

/** Mounts once textures have loaded; tells the page after the first full frame. */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    const id = requestAnimationFrame(() => requestAnimationFrame(() => onReady?.()));
    return () => cancelAnimationFrame(id);
  }, [invalidate, onReady]);
  return null;
}

function Lighting() {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.35;
    scene.background = new THREE.Color(C.wall);
    invalidate();
    return () => {
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, invalidate]);
  return (
    <>
      {/* daylight from the skylight above, warm bounce from the stone floor */}
      <hemisphereLight args={["#f4f1ea", "#7a5a38", 0.55]} />
      <directionalLight color="#fff1dc" intensity={1.25} position={[4, 20, 6]} />
    </>
  );
}

// ── Materials ───────────────────────────────────────────────────────────────

function useMaterials() {
  return useMemo(() => {
    const S = (color: string, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    return {
      wall: S(C.wall, 0.92),
      trim: S(C.trim, 0.7),
      ceiling: S(C.ceiling, 0.95),
      beam: S(C.beam, 0.62),
      track: S(C.track, 0.45, 0.3),
      marble: S(C.marble, 0.35, 0.02),
      gold: S(C.gold, 0.32, 0.85),
      goldDeep: S(C.goldDeep, 0.45, 0.7),
      liner: S(C.liner, 0.8),
      door: new THREE.MeshBasicMaterial({ color: C.door, toneMapped: false }),
      stone: S(C.stone, 0.55),
      panel: S(C.panel, 0.9),
      niche: S(C.niche, 0.9),
      iron: S(C.iron, 0.5, 0.6),
      bronze: S(C.bronze, 0.35, 0.8),
      glass: new THREE.MeshBasicMaterial({ color: C.glass, toneMapped: false }),
    };
  }, []);
}
type Materials = ReturnType<typeof useMaterials>;

function Box({ m, size, at, r = 0.03 }: { m: THREE.Material; size: [number, number, number]; at: [number, number, number]; r?: number }) {
  const radius = Math.max(0.001, Math.min(r, size[0] / 2 - 0.002, size[1] / 2 - 0.002, size[2] / 2 - 0.002));
  return <RoundedBox args={size} radius={radius} smoothness={2} position={at} material={m} />;
}

// ── Hall: floor, walls, arcade, skylight vault ─────────────────────────────

const DOOR_W = 3.2;
const DOOR_H = 4.2;

function Shell({ plan }: { plan: RoomPlan }) {
  const m = useMaterials();
  const { width: W, depth: D, springY } = plan;
  const R = W / 2; // vault radius
  const backZ = -D / 2;
  const sideW = (W - DOOR_W) / 2;
  return (
    <group>
      <Floor plan={plan} />
      <BackWall plan={plan} m={m} />
      <SideArcades plan={plan} m={m} />

      {/* front wall around the entrance, and the light beyond it */}
      {[-1, 1].map((s) => (
        <mesh key={`f${s}`} position={[s * (DOOR_W / 2 + sideW / 2), springY / 2, D / 2 + 0.1]} material={m.wall}>
          <boxGeometry args={[sideW, springY, 0.2]} />
        </mesh>
      ))}
      <mesh position={[0, DOOR_H + (springY - DOOR_H) / 2, D / 2 + 0.1]} material={m.wall}>
        <boxGeometry args={[DOOR_W, springY - DOOR_H, 0.2]} />
      </mesh>
      <mesh position={[0, springY, D / 2 + 0.1]} material={m.wall}>
        <circleGeometry args={[R, 48, 0, Math.PI]} />
      </mesh>
      <mesh position={[0, DOOR_H / 2, D / 2 + 3]} material={m.door}>
        <planeGeometry args={[DOOR_W + 6, DOOR_H + 4]} />
      </mesh>

      {/* cornice where the vault springs, along both sides */}
      {[-1, 1].map((s) => (
        <Box key={`c${s}`} m={m.trim} size={[0.7, 0.45, D]} at={[s * (W / 2 - 0.35), springY - 0.22, 0]} r={0.05} />
      ))}
      <Vault plan={plan} m={m} />

      {/* a low dais in front of the hung wall, with one step */}
      <Box m={m.stone} size={[plan.arcadeW + 2.4, 0.3, 2.4]} at={[0, 0.15, backZ + 1.2]} r={0.03} />
      <Box m={m.stone} size={[plan.arcadeW + 2.4, 0.15, 0.45]} at={[0, 0.075, backZ + 2.6]} r={0.02} />

      {/* urns on pedestals down both sides of the hall */}
      {[-1, 1].flatMap((s) =>
        [0.3, 0.62].map((f) => <Urn key={`${s}${f}`} m={m} at={[s * (W / 2 - 1.3), backZ + D * f]} />),
      )}
    </group>
  );
}

/** The hung wall: plinth, arcade of bays (columns, ledges, recessed panels), arched lunettes above, and the big lunette window under the vault. */
function BackWall({ plan, m }: { plan: RoomPlan; m: Materials }) {
  const { width: W, depth: D, springY, cols, rows, arcadeW, arcadeH } = plan;
  const z = -D / 2;
  const R = W / 2;
  const top = HALL.plinth + arcadeH;
  const wallShape = useMemo(() => {
    const sh = new THREE.Shape();
    sh.moveTo(-R, 0);
    sh.lineTo(R, 0);
    sh.lineTo(R, springY);
    sh.absarc(0, springY, R, 0, Math.PI, false);
    sh.lineTo(-R, 0);
    return sh;
  }, [R, springY]);
  const columnXs = useMemo(() => Array.from({ length: cols + 1 }, (_, k) => -arcadeW / 2 + k * HALL.bayW), [cols, arcadeW]);
  const levels = useMemo(() => Array.from({ length: rows }, (_, r) => top - (r + 1) * HALL.levelH), [rows, top]);
  const archR = HALL.bayW / 2 - 0.35;
  return (
    <group>
      <mesh position={[0, 0, z]} material={m.wall}>
        <shapeGeometry args={[wallShape, 48]} />
      </mesh>
      {/* plinth and the ledge under each level, with a cornice on top */}
      <Box m={m.stone} size={[arcadeW + 1, HALL.plinth, 0.5]} at={[0, HALL.plinth / 2, z + 0.25]} r={0.03} />
      {levels.map((y) => (
        <Box key={`l${y}`} m={m.trim} size={[arcadeW + 1, 0.22, 0.6]} at={[0, y, z + 0.3]} r={0.04} />
      ))}
      <Box m={m.trim} size={[arcadeW + 1.2, 0.32, 0.7]} at={[0, top + 0.1, z + 0.35]} r={0.05} />
      {/* recessed panel behind each painting */}
      {levels.flatMap((y) =>
        Array.from({ length: cols }, (_, c) => (
          <mesh key={`p${y}${c}`} position={[-arcadeW / 2 + (c + 0.5) * HALL.bayW, y + HALL.levelH / 2 + 0.05, z + 0.01]} material={m.panel}>
            <planeGeometry args={[HALL.bayW - 0.62, HALL.levelH - 0.45]} />
          </mesh>
        )),
      )}
      {/* columns between the bays, on every level */}
      {levels.flatMap((y) => columnXs.map((x) => <Column key={`k${x}${y}`} m={m} at={[x, y + 0.11, z + 0.32]} height={HALL.levelH - 0.22} />))}
      {/* arched lunettes in the upper wall, one per bay, lit from outside */}
      {Array.from({ length: cols }, (_, c) => {
        const x = -arcadeW / 2 + (c + 0.5) * HALL.bayW;
        return (
          <group key={`a${c}`} position={[x, top + 0.45, z + 0.02]}>
            <mesh material={m.niche}>
              <circleGeometry args={[archR, 32, 0, Math.PI]} />
            </mesh>
            <mesh position={[0, 0, 0.06]} material={m.trim}>
              <torusGeometry args={[archR + 0.06, 0.09, 8, 32, Math.PI]} />
            </mesh>
          </group>
        );
      })}
      {/* the great lunette window under the vault */}
      <group position={[0, springY + 0.05, z + 0.03]}>
        <mesh material={m.glass}>
          <circleGeometry args={[R * 0.55, 48, 0, Math.PI]} />
        </mesh>
        {Array.from({ length: 7 }, (_, i) => {
          const a = ((i + 1) / 8) * Math.PI;
          const r = R * 0.55;
          return (
            <mesh key={i} material={m.iron} position={[(Math.cos(a) * r) / 2, (Math.sin(a) * r) / 2, 0.02]} rotation={[0, 0, a - Math.PI / 2]}>
              <boxGeometry args={[0.06, r, 0.04]} />
            </mesh>
          );
        })}
        <mesh position={[0, 0, 0.05]} material={m.trim}>
          <torusGeometry args={[R * 0.55 + 0.08, 0.12, 8, 48, Math.PI]} />
        </mesh>
      </group>
    </group>
  );
}

function Column({ m, at, height }: { m: Materials; at: [number, number, number]; height: number }) {
  const [x, y, z] = at;
  const shaft = height - 0.5;
  return (
    <group position={[x, y, z]}>
      <Box m={m.trim} size={[0.62, 0.22, 0.5]} at={[0, 0.11, 0]} r={0.03} />
      <mesh position={[0, 0.22 + shaft / 2, 0]} material={m.trim}>
        <cylinderGeometry args={[0.19, 0.22, shaft, 24]} />
      </mesh>
      <Box m={m.trim} size={[0.66, 0.28, 0.54]} at={[0, height - 0.14, 0]} r={0.04} />
    </group>
  );
}

/** Both side walls: a tall blind arcade (no paintings) that gives the hall its depth. */
function SideArcades({ plan, m }: { plan: RoomPlan; m: Materials }) {
  const { width: W, depth: D, springY } = plan;
  const bay = 4.2;
  const count = Math.max(2, Math.floor(D / bay));
  const start = -D / 2 + (D - count * bay) / 2;
  const archTop = springY - 1.2;
  const archR = bay / 2 - 0.55;
  const niche = useMemo(() => {
    const sh = new THREE.Shape();
    const springAt = archTop - archR;
    sh.moveTo(-archR, 0);
    sh.lineTo(archR, 0);
    sh.lineTo(archR, springAt);
    sh.absarc(0, springAt, archR, 0, Math.PI, false);
    sh.lineTo(-archR, 0);
    return sh;
  }, [archTop, archR]);
  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (W / 2), 0, 0]} rotation={[0, (-s * Math.PI) / 2, 0]}>
          <mesh position={[0, springY / 2, 0]} material={m.wall}>
            <planeGeometry args={[D, springY]} />
          </mesh>
          {Array.from({ length: count }, (_, i) => {
            const u = -s * (start + (i + 0.5) * bay);
            return (
              <group key={i} position={[u, 0, 0.01]}>
                <mesh material={m.niche}>
                  <shapeGeometry args={[niche, 24]} />
                </mesh>
                <mesh position={[0, archTop - archR, 0.05]} material={m.trim}>
                  <torusGeometry args={[archR + 0.05, 0.1, 8, 32, Math.PI]} />
                </mesh>
              </group>
            );
          })}
          {Array.from({ length: count + 1 }, (_, i) => (
            <Column key={`c${i}`} m={m} at={[-s * (start + i * bay), 0, 0.3]} height={springY - 0.5} />
          ))}
          <Box m={m.stone} size={[D, 0.5, 0.12]} at={[0, 0.25, 0.06]} r={0.02} />
        </group>
      ))}
    </>
  );
}

/** Glass barrel vault on iron ribs: the skylight that lights the hall. */
function Vault({ plan, m }: { plan: RoomPlan; m: Materials }) {
  const { width: W, depth: D, springY } = plan;
  const R = W / 2;
  const glass = useMemo(() => {
    const tex = skylightTexture();
    tex.repeat.set(1, Math.max(2, Math.round(D / 3)));
    return new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, toneMapped: false });
  }, [D]);
  useEffect(() => () => glass.dispose(), [glass]);
  const ribs = useMemo(() => {
    const n = Math.max(3, Math.round(D / 3.5));
    return Array.from({ length: n + 1 }, (_, i) => -D / 2 + (D / n) * i);
  }, [D]);
  return (
    <group position={[0, springY, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={glass}>
        <cylinderGeometry args={[R, R, D, 48, 1, true, -Math.PI / 2, Math.PI]} />
      </mesh>
      {ribs.map((z) => (
        <mesh key={z} position={[0, 0, z]} material={m.iron}>
          <torusGeometry args={[R - 0.05, 0.1, 8, 48, Math.PI]} />
        </mesh>
      ))}
    </group>
  );
}

let skylightTex: THREE.CanvasTexture | null = null;
/** Pale sky through glass, with the iron glazing bars. */
function skylightTexture() {
  if (skylightTex) return skylightTex.clone();
  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const g = canvas.getContext("2d")!;
  const sky = g.createLinearGradient(0, 0, S, 0);
  sky.addColorStop(0, "#dfe7ee");
  sky.addColorStop(0.5, "#f4f7f9");
  sky.addColorStop(1, "#dfe7ee");
  g.fillStyle = sky;
  g.fillRect(0, 0, S, S);
  g.fillStyle = "#4b4f54";
  for (let i = 0; i <= 16; i++) g.fillRect((i * S) / 16 - 1.5, 0, 3, S);
  for (let j = 0; j <= 4; j++) g.fillRect(0, (j * S) / 4 - 1.5, S, 3);
  skylightTex = new THREE.CanvasTexture(canvas);
  skylightTex.colorSpace = THREE.SRGBColorSpace;
  skylightTex.wrapS = skylightTex.wrapT = THREE.RepeatWrapping;
  skylightTex.anisotropy = 8;
  return skylightTex.clone();
}

function Urn({ m, at }: { m: Materials; at: [number, number] }) {
  const profile = useMemo(
    () =>
      [
        [0, 0],
        [0.22, 0],
        [0.18, 0.08],
        [0.12, 0.16],
        [0.3, 0.45],
        [0.34, 0.62],
        [0.26, 0.8],
        [0.2, 0.86],
        [0.28, 0.92],
        [0, 0.92],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
    [],
  );
  return (
    <group position={[at[0], 0, at[1]]}>
      <Box m={m.stone} size={[0.9, 1.1, 0.9]} at={[0, 0.55, 0]} r={0.03} />
      <Box m={m.trim} size={[1, 0.1, 1]} at={[0, 1.15, 0]} r={0.02} />
      <mesh position={[0, 1.2, 0]} material={m.bronze}>
        <latheGeometry args={[profile, 32]} />
      </mesh>
    </group>
  );
}

function Floor({ plan }: { plan: RoomPlan }) {
  const { width: W, depth: D } = plan;
  const len = D + 8; // runs out through the entrance
  const material = useMemo(() => {
    const t = stoneTexture();
    t.repeat.set(W / 3, len / 3);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0, envMapIntensity: 0.9 });
  }, [W, len]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh position={[0, 0, 4]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[W, len]} />
    </mesh>
  );
}

/** Large pale limestone slabs with fine joints and a little variation. */
function stoneTexture() {
  const S = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const g = canvas.getContext("2d")!;
  const tones = ["#cdbfa6", "#c6b79d", "#d3c6ae", "#c1b195"];
  const half = S / 2;
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      g.fillStyle = tones[(i * 2 + j) % tones.length];
      g.fillRect(i * half, j * half, half, half);
    }
  g.strokeStyle = "rgba(90, 72, 50, 0.45)";
  g.lineWidth = 2;
  for (let k = 0; k <= 2; k++) {
    g.beginPath();
    g.moveTo(k * half, 0);
    g.lineTo(k * half, S);
    g.moveTo(0, k * half);
    g.lineTo(S, k * half);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

// ── Paintings ───────────────────────────────────────────────────────────────

function Exhibits({ plan, exhibits, control, anchors }: { plan: RoomPlan } & Omit<Props, "onReady">) {
  const srcs = useMemo(() => exhibits.flatMap((e) => (e.kind === "artwork" ? [e.src] : [])), [exhibits]);
  const loaded = useTexture(srcs.length ? srcs : ["/gallery/floor-wood.webp"]);
  const textures = useMemo(() => {
    const list = Array.isArray(loaded) ? loaded : [loaded];
    let k = 0;
    return exhibits.map((e) => {
      if (e.kind === "upload") return uploadTexture();
      const tex = list[k++];
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      return tex;
    });
  }, [loaded, exhibits]);
  const sizes = useMemo(
    () =>
      textures.map((tex) => {
        const img = tex.image as { width?: number; height?: number } | undefined;
        return paintingSize(img?.width && img?.height ? img.width / img.height : 4 / 5);
      }),
    [textures],
  );
  const m = useMaterials();
  return (
    <>
      {plan.slots.map((slot, i) => (
        <Painting key={exhibits[i].key} slot={slot} size={sizes[i]} texture={textures[i]} title={exhibits[i].title} m={m} />
      ))}
      <CameraRig plan={plan} sizes={sizes} control={control} anchors={anchors} />
    </>
  );
}

function Painting({
  slot,
  size,
  texture,
  title,
  m,
}: {
  slot: Slot;
  size: { w: number; h: number };
  texture: THREE.Texture;
  title: string;
  m: Materials;
}) {
  const { w, h } = size;
  const fw = frameWidth(size);
  const depth = 0.09;
  const label = useMemo(() => labelTexture(title), [title]);
  useEffect(() => () => label.dispose(), [label]);
  const frame = useMemo(() => frameTexture(w, h, fw), [w, h, fw]);
  useEffect(() => () => frame.dispose(), [frame]);
  const z = 0.02; // off the wall
  const ow = w + 2 * fw;
  const oh = h + 2 * fw;
  return (
    <group position={slot.center}>
      {/* wash of light from the track spot above */}
      <Wash width={Math.max(ow * 1.5, 2.2)} top={HALL.levelH / 2 - 0.1} />

      {/* Sheva's carved gilt frame (see frame-texture.ts) on a dark wooden body that gives it depth */}
      <FrameRing m={m.liner} w={w} h={h} band={fw} inset={0} depth={depth} z={z} />
      <mesh position={[0, 0, z + depth * 0.4]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={texture} roughness={0.85} metalness={0} envMapIntensity={0.25} />
      </mesh>
      <mesh position={[0, 0, z + depth + 0.002]}>
        <planeGeometry args={[ow, oh]} />
        <meshStandardMaterial map={frame} transparent alphaTest={0.4} roughness={0.42} metalness={0.35} envMapIntensity={0.9} />
      </mesh>

      {/* museum label under the frame */}
      <mesh position={[0, -oh / 2 - 0.32, z + 0.01]}>
        <planeGeometry args={[1.05, 0.3]} />
        <meshBasicMaterial map={label} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Four rails around a w × h opening; `inset` moves the band outward from the opening edge. */
function FrameRing({ m, w, h, band, inset, depth, z }: { m: THREE.Material; w: number; h: number; band: number; inset: number; depth: number; z: number }) {
  const ow = w + 2 * (inset + band);
  const y = h / 2 + inset + band / 2;
  const x = w / 2 + inset + band / 2;
  const at = z + depth / 2;
  return (
    <>
      <Box m={m} size={[ow, band, depth]} at={[0, y, at]} r={0.02} />
      <Box m={m} size={[ow, band, depth]} at={[0, -y, at]} r={0.02} />
      <Box m={m} size={[band, h + 2 * inset, depth]} at={[-x, 0, at]} r={0.02} />
      <Box m={m} size={[band, h + 2 * inset, depth]} at={[x, 0, at]} r={0.02} />
    </>
  );
}

function Wash({ width, top }: { width: number; top: number }) {
  const map = useWashTexture();
  const h = HALL.levelH * 0.95;
  return (
    <mesh position={[0, top - h / 2, 0.006]} renderOrder={1}>
      <planeGeometry args={[width, h]} />
      <meshBasicMaterial map={map} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

let washTexture: THREE.CanvasTexture | null = null;
function useWashTexture() {
  return useMemo(() => {
    if (washTexture) return washTexture;
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.translate(size / 2, size * 0.3);
    ctx.scale(1, 1.5);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.5);
    g.addColorStop(0, "rgba(255, 214, 160, 0.4)");
    g.addColorStop(0.5, "rgba(255, 206, 150, 0.18)");
    g.addColorStop(1, "rgba(255, 200, 140, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(-size, -size, size * 2, size * 2);
    washTexture = new THREE.CanvasTexture(canvas);
    washTexture.colorSpace = THREE.SRGBColorSpace;
    return washTexture;
  }, []);
}

/** A small white museum label with the title, at most two lines. */
function labelTexture(title: string) {
  const W = 700;
  const H = 200;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  g.fillStyle = C.plaque;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "#e4ddcf";
  g.lineWidth = 4;
  g.strokeRect(2, 2, W - 4, H - 4);
  g.fillStyle = "#2b2723";
  g.font = '600 54px Georgia, "Times New Roman", serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  const lines = wrap(g, title, W - 60, 2);
  lines.forEach((line, i) => g.fillText(line, W / 2, H / 2 + (i - (lines.length - 1) / 2) * 64));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width <= maxW || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last && g.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

let uploadTex: THREE.CanvasTexture | null = null;
/** "Foto lukisanmu": an empty canvas with a dashed outline that invites an upload. */
function uploadTexture() {
  if (uploadTex) return uploadTex;
  const W = 640;
  const H = 800;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#f3ede1";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "#b9ad97";
  g.lineWidth = 6;
  g.setLineDash([22, 16]);
  g.strokeRect(48, 48, W - 96, H - 96);
  g.setLineDash([]);
  g.fillStyle = "#2b2723";
  g.textAlign = "center";
  // camera glyph
  g.lineWidth = 10;
  g.strokeStyle = "#2b2723";
  g.strokeRect(W / 2 - 70, H / 2 - 150, 140, 100);
  g.beginPath();
  g.arc(W / 2, H / 2 - 100, 30, 0, Math.PI * 2);
  g.stroke();
  g.font = '400 64px Georgia, "Times New Roman", serif';
  g.fillText("Foto lukisanmu", W / 2, H / 2 + 40);
  g.font = "400 34px system-ui, sans-serif";
  g.fillStyle = "#5f5850";
  g.fillText("Unggah foto karya,", W / 2, H / 2 + 110);
  g.fillText("lalu ikuti tahapannya.", W / 2, H / 2 + 154);
  uploadTex = new THREE.CanvasTexture(canvas);
  uploadTex.colorSpace = THREE.SRGBColorSpace;
  return uploadTex;
}

// ── Camera ──────────────────────────────────────────────────────────────────

/**
 * Walks the camera between poses and keeps each painting's HTML link over its
 * on-screen rectangle. Reads `control` every frame; renders only while moving.
 */
function CameraRig({
  plan,
  sizes,
  control,
  anchors,
}: {
  plan: RoomPlan;
  sizes: { w: number; h: number }[];
  control: RefObject<RoomControl>;
  anchors: RefObject<(HTMLElement | null)[]>;
}) {
  const { camera, size, invalidate } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const state = useRef<{ serial: number; from: Pose; start: number; seconds: number; current: Pose | null; arrived: boolean }>({
    serial: -1,
    from: overviewPose(plan, 16 / 9),
    start: 0,
    seconds: 0,
    current: null,
    arrived: true,
  });
  const tmp = useMemo(
    () => ({ v: new THREE.Vector3() }),
    [],
  );

  useEffect(() => {
    if (control.current) control.current.invalidate = invalidate;
  }, [control, invalidate]);

  useFrame(() => {
    const ctl = control.current;
    if (!ctl) return;
    const aspect = size.width / Math.max(1, size.height);
    const fov = fovFor(aspect);
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const s = state.current;
    const goal = (): Pose => {
      if (ctl.target.kind === "slot") {
        const slot = plan.slots[ctl.target.index];
        if (slot) return slotPose(plan, slot, sizes[slot.index], aspect);
      }
      return overviewPose(plan, aspect);
    };
    const now = performance.now();
    if (ctl.serial !== s.serial) {
      s.serial = ctl.serial;
      s.from = ctl.fromDoorway ? entrancePose(plan, aspect) : (s.current ?? goal());
      s.start = now;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      s.seconds = ctl.instant || reduce ? 0 : walkSeconds(s.from, goal()) * (ctl.fromDoorway ? 1.15 : 1);
      s.arrived = false;
      ctl.fromDoorway = false;
      ctl.instant = false;
    }
    if (ctl.hold) s.start = now;
    const t = s.seconds > 0 ? Math.min(1, (now - s.start) / (s.seconds * 1000)) : 1;
    const pose = lerpPose(s.from, goal(), easeInOutCubic(t));
    s.current = pose;
    cam.position.set(...pose.pos);
    cam.rotation.set(pose.pitch, -pose.yaw, 0, "YXZ");
    cam.updateMatrixWorld();
    if (t < 1) invalidate();
    else if (!s.arrived) {
      s.arrived = true;
      ctl.onArrive?.(ctl.target);
    }
    placeAnchors();
  });

  /** Put each painting's link over its canvas as drawn on screen; hide links of paintings not in view. */
  function placeAnchors() {
    const list = anchors.current;
    if (!list) return;
    const W = size.width;
    const H = size.height;
    plan.slots.forEach((slot, i) => {
      const el = list[i];
      if (!el) return;
      const { w, h } = sizes[i];
      const [cx, cy, cz] = slot.center;
      // Every painting hangs on the wall facing the visitor, so it is never seen from behind.
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let inFront = true;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          tmp.v.set(cx + (sx * w) / 2, cy + (sy * h) / 2, cz + 0.08);
          tmp.v.project(cam);
          if (tmp.v.z > 1 || tmp.v.z < -1) inFront = false;
          const px = ((tmp.v.x + 1) / 2) * W;
          const py = ((1 - tmp.v.y) / 2) * H;
          minX = Math.min(minX, px);
          maxX = Math.max(maxX, px);
          minY = Math.min(minY, py);
          maxY = Math.max(maxY, py);
        }
      }
      const onScreen = inFront && maxX > 0 && minX < W && maxY > 0 && minY < H;
      el.style.transform = `translate(${minX}px, ${minY}px)`;
      el.style.width = `${Math.max(0, maxX - minX)}px`;
      el.style.height = `${Math.max(0, maxY - minY)}px`;
      el.dataset.inView = onScreen ? "true" : "false";
    });
  }
  return null;
}
