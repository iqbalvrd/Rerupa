"use client";

/**
 * A skylit gallery with exhibits on three walls. Shared, simple surfaces and
 * generated plaster/stone textures keep the room free of new model downloads.
 * The camera turns toward each wall; idle rendering remains on demand.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox, useTexture } from "@react-three/drei";
import { EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { PictureBeam, PictureSpotlights } from "./picture-lighting";
import { SunsetWindows } from "./sunset-windows";
import { frameTexture } from "./frame-texture";
import { bronzeReliefTexture, carvedWoodTexture, centerpieceGeometry, floorInlayTexture, wallReliefTexture } from "./heritage-details";
import { softDiscTexture, surfaceTextures } from "./surface-textures";
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

export type Exhibit = { key: string; title: string } & ({ kind: "artwork"; src: string } | { kind: "upload" } | { kind: "placeholder"; aspect: number });

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
  wall: "#d8d0c0",
  trim: "#e7e0d3",
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
  const materials = useMaterials();
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
        <Shell plan={plan} m={materials} />
        <SunsetWindows plan={plan} control={control} />
        <Exhibits m={materials} plan={plan} exhibits={exhibits} control={control} anchors={anchors} />
        <EffectComposer multisampling={4} enableNormalPass={false}>
          <N8AO halfRes quality="performance" aoRadius={0.8} distanceFalloff={0.6} intensity={1.35} color="#3a2a1c" />
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
      <hemisphereLight args={["#e7cfcb", "#9c7955", 0.68]} />
      <directionalLight color="#ffd4a3" intensity={1.35} position={[-4, 16, -3]} />
      <directionalLight color="#bcbdd8" intensity={0.28} position={[5, 9, 6]} />
    </>
  );
}

// ── Materials ───────────────────────────────────────────────────────────────

function useMaterials() {
  const materials = useMemo(() => {
    const S = (color: string, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const plaster = surfaceTextures("plaster");
    plaster.map.repeat.set(4, 3); plaster.bumpMap.repeat.set(4, 3);
    const oak = surfaceTextures("oak");
    const stone = surfaceTextures("stone");
    const carvedWood = carvedWoodTexture();
    const reliefFinish = bronzeReliefTexture();
    const wallRelief = wallReliefTexture();
    const columnGrain = surfaceTextures("painted-wood");
    columnGrain.map.repeat.set(1, 2);
    columnGrain.bumpMap.repeat.set(1, 2);
    return {
      wall: new THREE.MeshStandardMaterial({ color: C.wall, ...plaster, roughness: 0.94, bumpScale: 0.018 }),
      oak: new THREE.MeshStandardMaterial({ ...oak, roughness: 0.63, envMapIntensity: 0.3, bumpScale: 0.008 }),
      limestone: new THREE.MeshStandardMaterial({ ...stone, roughness: 0.76, envMapIntensity: 0.25, bumpScale: 0.014 }),
      carvedWood: new THREE.MeshStandardMaterial({
        map: carvedWood, bumpMap: carvedWood, bumpScale: 0.009, roughness: 0.74,
      }),
      bronzeRelief: new THREE.MeshStandardMaterial({
        map: reliefFinish, bumpMap: reliefFinish, bumpScale: 0.007,
        roughness: 0.47, metalness: 0.5, envMapIntensity: 0.9,
      }),
      pedestalWood: S("#3d291e", 0.76),
      paintedColumn: new THREE.MeshStandardMaterial({ color: "#3c594d", ...columnGrain, roughness: 0.82, bumpScale: 0.025 }),
      wallRelief: new THREE.MeshStandardMaterial({ map: wallRelief, bumpMap: wallRelief, bumpScale: 0.018, roughness: 0.88 }),
      contact: new THREE.MeshBasicMaterial({ map: softDiscTexture("rgba(34,26,17,0.5)"), transparent: true, depthWrite: false, opacity: 0.65 }),
      daylight: new THREE.MeshBasicMaterial({ map: softDiscTexture("rgba(255,234,191,0.4)"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.28 }),
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
      bronze: S(C.bronze, 0.45, 0.65),
      glass: new THREE.MeshBasicMaterial({ color: C.glass, toneMapped: false }),
    };
  }, []);
  useEffect(() => () => {
    const textures = new Set<THREE.Texture>();
    for (const material of Object.values(materials)) {
      if (material.map) textures.add(material.map);
      if ("bumpMap" in material && material.bumpMap) textures.add(material.bumpMap);
      material.dispose();
    }
    textures.forEach(texture => texture.dispose());
  }, [materials]);
  return materials;
}
type Materials = ReturnType<typeof useMaterials>;

function Box({ m, size, at, r = 0.03 }: { m: THREE.Material; size: [number, number, number]; at: [number, number, number]; r?: number }) {
  const radius = Math.max(0.001, Math.min(r, size[0] / 2 - 0.002, size[1] / 2 - 0.002, size[2] / 2 - 0.002));
  return <RoundedBox args={size} radius={radius} smoothness={1} position={at} material={m} />;
}

/** Profiled piers use a few broad shapes instead of dense sculptural meshes. */
function HallPier({ m, height }: { m: Materials; height: number }) {
  return <group scale={[0.8, 1, 0.8]}>
    <Box m={m.stone} size={[0.8, 0.22, 0.65]} at={[0, 0.11, 0]} />
    <Box m={m.trim} size={[0.64, 0.16, 0.52]} at={[0, 0.3, 0]} />
    <mesh position={[0, height / 2, 0]} material={m.paintedColumn}>
      <cylinderGeometry args={[0.21, 0.25, height - 0.8, 32]} />
    </mesh>
    {[0.43, height - 0.48].map(y => <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.goldDeep}>
      <torusGeometry args={[y < 1 ? 0.25 : 0.215, 0.025, 6, 32]} />
    </mesh>)}
    <Box m={m.trim} size={[0.56, 0.15, 0.48]} at={[0, height - 0.35, 0]} />
    <Box m={m.trim} size={[0.75, 0.24, 0.64]} at={[0, height - 0.15, 0]} />
  </group>;
}

/** Repeat one carved tile along all three walls while keeping the same motif size. */
function CarvedFrieze({ length, material, height = 0.19 }: { length: number; material: THREE.Material; height?: number }) {
  const geometry = useMemo(() => {
    const section = new THREE.PlaneGeometry(length, height);
    const uv = section.getAttribute("uv");
    const repeats = Math.max(1, Math.round(length / (height * 4)));
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * repeats);
    return section;
  }, [length, height]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} />;
}

/** Low wooden panels leave the artwork and labels clear above the dado rail. */
function WallPanels({ length, m }: { length: number; m: Materials }) {
  return <group>
    <Box m={m.pedestalWood} size={[length, 1.02, 0.06]} at={[0, 0.51, 0.03]} r={0.006} />
    <group position={[0, 0.52, 0.065]}><CarvedFrieze length={length - 0.18} height={0.64} material={m.carvedWood} /></group>
    <Box m={m.pedestalWood} size={[length, 0.09, 0.12]} at={[0, 1.055, 0.05]} r={0.012} />
    <Box m={m.goldDeep} size={[length, 0.018, 0.015]} at={[0, 1.105, 0.09]} r={0.001} />
  </group>;
}

// Architecture uses simple shared-material surfaces; no new asset downloads or shadow maps.
function Shell({ plan, m }: { plan: RoomPlan; m: Materials }) {
  const { width: W, depth: D, springY: Y } = plan;
  const roofHalf = W * 0.24;
  const shoulder = W / 2 - roofHalf;
  const rise = 1.4;
  const slope = Math.atan2(rise, shoulder);
  const entablatureY = 4.85 + (plan.rows - 1) * HALL.levelH;
  const windowR = Math.min(3.3, W * 0.3);
  return <group>
    <Floor plan={plan} />
    <Furnishings plan={plan} m={m} />
    <group position={[0, 0, -D / 2 + 0.01]}><WallPanels length={W} m={m} /></group>
    <Box m={m.wall} size={[W, Y + 1.4, 0.24]} at={[0, (Y + 1.4) / 2, -D / 2 - 0.12]} />
    {/* Tall framed arcade and a fanlight give the end wall a monumental focal point. */}
    <group position={[0, entablatureY + 0.12, -D / 2 + 0.05]}>

      <mesh position={[0, 0, 0.05]} material={m.trim}><torusGeometry args={[windowR + 0.07, 0.14, 8, 48, Math.PI]} /></mesh>
      {Array.from({length:7},(_,i)=> {
        const angle = (i + 1) * Math.PI / 8;
        return <mesh key={i} position={[Math.cos(angle) * windowR / 2, Math.sin(angle) * windowR / 2, 0.03]} rotation={[0,0,angle-Math.PI/2]} material={m.iron}>
          <boxGeometry args={[0.045, windowR, 0.04]} />
        </mesh>;
      })}
    </group>
    {Array.from({length:plan.cols+1},(_,k)=><group key={`pier${k}`} position={[-plan.arcadeW/2 + k * HALL.bayW, 0, -D / 2 + 0.3]}><HallPier m={m} height={entablatureY - 0.08} /></group>)}
    {[[-0.12,0.16,0.5],[0.08,0.2,0.62],[0.28,0.12,0.75]].map(([dy,h,d],i)=><Box key={`back-cornice${i}`} m={m.trim} size={[W,h,d]} at={[0,entablatureY+dy,-D/2+d/2]} />)}
    <group position={[0, entablatureY + 0.08, -D / 2 + 0.621]}>
      <CarvedFrieze length={W - 1.04} material={m.carvedWood} />
    </group>
    <Box m={m.stone} size={[W,0.22,0.45]} at={[0,0.11,-D/2+0.2]} />
    {[-1, 1].map(sign => <group key={sign}>
      <group position={[sign * (W / 2 - 0.01), 0, 0]} rotation={[0, -sign * Math.PI / 2, 0]}><WallPanels length={D} m={m} /></group>
      <Box m={m.wall} size={[0.24, Y, D]} at={[sign * (W / 2 + 0.12), Y / 2, 0]} />
      <Box m={m.stone} size={[0.1, 0.22, D]} at={[sign * (W / 2 - 0.05), 0.11, 0]} />
      <Box m={m.iron} size={[0.12, 0.08, D]} at={[sign * (W / 2 - 0.06), Y - 0.12, 0]} r={0.01} />
      <mesh position={[sign * (W / 2 - 0.15), Y - 0.04, 0]}>
        <boxGeometry args={[0.07, 0.035, D]} /><meshBasicMaterial color="#ffe3b1" />
      </mesh>
      <group position={[sign * (roofHalf + shoulder / 2), Y + rise / 2, 0]} rotation={[0, 0, -sign * slope]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={m.ceiling}><planeGeometry args={[Math.hypot(shoulder, rise), D]} /></mesh>
        {Array.from({ length: Math.ceil(D / 2.8) + 1 }, (_, i) => <Box key={i} m={m.pedestalWood} size={[Math.hypot(shoulder, rise), 0.12, 0.15]} at={[0, -0.055, -D / 2 + i * D / Math.ceil(D / 2.8)]} r={0.01} />)}
      </group>
      <Box m={m.iron} size={[0.08, 0.1, D]} at={[sign * roofHalf, Y + rise, 0]} r={0.01} />
      {/* Repeated piers between the paintings reinforce the hall's depth. */}
      {[ -D / 2 + 0.4, ...plan.slots.filter(slot => slot.wall === (sign < 0 ? "left" : "right") && !slot.upper).slice(1).map(slot=>slot.center[2]-1.9)].map((z,i)=><group key={i} position={[sign*(W/2-0.24),0,z]} rotation={[0,-sign*Math.PI/2,0]}><HallPier m={m} height={entablatureY - 0.08} /></group>)}
      {[[-0.12,0.16,0.4],[0.08,0.2,0.52],[0.28,0.12,0.64]].map(([dy,h,w],i)=><Box key={`side-cornice${i}`} m={m.trim} size={[w,h,D]} at={[sign*(W/2-w/2),entablatureY+dy,0]} />)}
      <group position={[sign * (W / 2 - 0.521), entablatureY + 0.08, 0]} rotation={[0, -sign * Math.PI / 2, 0]}>
        <CarvedFrieze length={D} material={m.carvedWood} />
      </group>
      <Box m={m.trim} size={[0.65,0.24,D]} at={[sign*(W/2-0.32),Y-0.16,0]} />
    </group>)}
    {Array.from({length: Math.ceil(D / 2.8) + 1}, (_,i) => {
      const z = -D / 2 + i * D / Math.ceil(D / 2.8);
      return <Box key={i} m={m.iron} size={[roofHalf * 2, 0.07, 0.07]} at={[0, Y + rise - 0.02, z]} r={0.01} />;
    })}
    {/* Front wall is behind the visitor, with an opening back to the entrance. */}
    {[-1,1].map(sign => <Box key={sign} m={m.wall} size={[(W - 3.2)/2,Y,0.2]} at={[sign*(W+3.2)/4,Y/2,D/2]} />)}
    <Box m={m.wall} size={[3.2,Y-4.2,0.2]} at={[0,4.2+(Y-4.2)/2,D/2]} />
  </group>;
}

/** Sparse furniture leaves the central approach and all painting views open. */
function Furnishings({ plan, m }: { plan: RoomPlan; m: Materials }) {
  const back = -plan.depth / 2;
  // Align the sculpture with the gap between frames from the entrance.
  const sculptureX = plan.cols % 2 === 0 ? 0 : -HALL.bayW * 0.42;
  const sculpture = useMemo(centerpieceGeometry, []);
  const sculptureMaterials = useMemo(() => [m.bronzeRelief, m.bronze], [m]);
  useEffect(() => () => sculpture.dispose(), [sculpture]);
  return <group>
    {[-1,1].map(sign => <group key={sign} position={[sign * 2.75, 0, back + 8.8]}>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.012,0]} material={m.contact}><planeGeometry args={[3.4,1.5]} /></mesh>
      <Box m={m.oak} size={[2.6,0.16,0.65]} at={[0,0.48,0]} r={0.035} />
      {[-0.95,0.95].map(x=><Box key={x} m={m.oak} size={[0.18,0.4,0.55]} at={[x,0.2,0]} r={0.018} />)}
    </group>)}
    <group position={[sculptureX, 0, back + 5.9]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]} material={m.contact}>
        <planeGeometry args={[2.05, 1.85]} />
      </mesh>
      <Box m={m.pedestalWood} size={[1.04, 0.065, 0.83]} at={[0, 0.0325, 0]} r={0.009} />
      <Box m={m.limestone} size={[0.97, 0.86, 0.76]} at={[0, 0.495, 0]} r={0.016} />
      <Box m={m.stone} size={[1.02, 0.06, 0.81]} at={[0, 0.955, 0]} r={0.008} />
      <Box m={m.pedestalWood} size={[0.78, 0.075, 0.4]} at={[0, 1.0225, 0]} r={0.01} />
      <mesh geometry={sculpture} material={sculptureMaterials} position={[0, 1.045, 0]} rotation={[0, -0.14, 0]} />
      <Box m={m.bronze} size={[0.23, 0.085, 0.009]} at={[0, 0.74, 0.384]} r={0.001} />
      <pointLight color="#ffd2a2" intensity={6} distance={3.8} position={[-0.9, 2.65, 1.55]} />
    </group>
    <mesh position={[0,0.008,back+7]} rotation={[-Math.PI/2,0,0]} material={m.daylight}><planeGeometry args={[plan.width*0.8,11]} /></mesh>
  </group>;
}

function Floor({ plan }: { plan: RoomPlan }) {
  const { width: W, depth: D } = plan;
  const len = D + 8;
  const material = useMemo(() => {
    const textures = surfaceTextures("stone");
    textures.map.repeat.set(W / 3.6, len / 3.6);
    textures.bumpMap.repeat.copy(textures.map.repeat);
    textures.map.dispose();
    const inlay = floorInlayTexture(W, len);
    return new THREE.MeshStandardMaterial({ map: inlay, bumpMap: textures.bumpMap, roughness: 0.66, metalness: 0, bumpScale: 0.012, envMapIntensity: 0.4 });
  }, [W, len]);
  useEffect(() => () => { material.map?.dispose(); material.bumpMap?.dispose(); material.dispose(); }, [material]);
  return <mesh position={[0,0,4]} rotation={[-Math.PI/2,0,0]} material={material}><planeGeometry args={[W,len]} /></mesh>;
}

// ── Paintings ───────────────────────────────────────────────────────────────

function Exhibits({ plan, exhibits, control, anchors, m }: { plan: RoomPlan; m: Materials } & Omit<Props, "onReady">) {
  const srcs = useMemo(() => exhibits.flatMap((e) => (e.kind === "artwork" ? [e.src] : [])), [exhibits]);
  const loaded = useTexture(srcs.length ? srcs : ["/gallery/floor-wood.webp"]);
  const textures = useMemo(() => {
    const list = Array.isArray(loaded) ? loaded : [loaded];
    let k = 0;
    return exhibits.map((e) => {
      if (e.kind === "upload") return uploadTexture();
      if (e.kind === "placeholder") return blankTexture();
      const tex = list[k++];
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      return tex;
    });
  }, [loaded, exhibits]);
  const sizes = useMemo(
    () =>
      textures.map((tex, i) => {
        const exhibit = exhibits[i];
        if (exhibit.kind === "placeholder") return paintingSize(exhibit.aspect);
        const img = tex.image as { width?: number; height?: number } | undefined;
        return paintingSize(img?.width && img?.height ? img.width / img.height : 4 / 5);
      }),
    [textures, exhibits],
  );
  return (
    <>
      {plan.slots.map((slot, i) => (
        <Painting key={exhibits[i].key} slot={slot} size={sizes[i]} texture={textures[i]} title={exhibits[i].title} m={m} />
      ))}
      <PictureSpotlights plan={plan} sizes={sizes} control={control} />
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
    <group position={slot.center} rotation={[0, slot.rotation, 0]}>
      {/* Physical fixture plus a soft projected wash: no per-picture shadow maps. */}
      <Box m={m.track} size={[0.12,0.18,0.05]} at={[0,h/2+0.72,0.04]} r={0.008} />
      <Box m={m.track} size={[0.04,0.04,0.54]} at={[0,h/2+0.72,0.3]} r={0.005} />
      <group position={[0,h/2+0.62,0.56]} rotation={[Math.atan2(0.5, h/2+0.5),0,0]}>
        <mesh material={m.track}><cylinderGeometry args={[0.075,0.09,0.22,12]} /></mesh>
        <mesh position={[0,-0.112,0]} rotation={[Math.PI/2,0,0]}><circleGeometry args={[0.068,12]} /><meshStandardMaterial color="#fff0cc" emissive="#ffd296" emissiveIntensity={3} toneMapped={false} /></mesh>
      </group>
      <PictureBeam height={h} />
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
      <meshBasicMaterial map={map} transparent opacity={0.65} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

let washTexture: THREE.CanvasTexture | null = null;
function useWashTexture() {
  return useMemo(() => {
    if (washTexture) return washTexture;
    washTexture = softDiscTexture("rgba(255,221,172,0.3)");
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

let blankTex: THREE.CanvasTexture | null = null;
function blankTexture() {
  if (blankTex) return blankTex;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f4efe5";
  ctx.fillRect(0, 0, 256, 256);
  blankTex = new THREE.CanvasTexture(canvas);
  blankTex.colorSpace = THREE.SRGBColorSpace;
  return blankTex;
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
      // Project local image corners using the wall orientation. Hide back-facing links.
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let inFront = true;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const u = (sx * w) / 2;
          tmp.v.set(cx + u * Math.cos(slot.rotation) + 0.08 * Math.sin(slot.rotation), cy + (sy * h) / 2, cz - u * Math.sin(slot.rotation) + 0.08 * Math.cos(slot.rotation));
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
      const facing = (cam.position.x - cx) * Math.sin(slot.rotation) + (cam.position.z - cz) * Math.cos(slot.rotation) > 0;
      const onScreen = facing && inFront && maxX > 0 && minX < W && maxY > 0 && minY < H;
      el.style.transform = `translate(${minX}px, ${minY}px)`;
      el.style.width = `${Math.max(0, maxX - minX)}px`;
      el.style.height = `${Math.max(0, maxY - minY)}px`;
      el.dataset.inView = onScreen ? "true" : "false";
    });
  }
  return null;
}
