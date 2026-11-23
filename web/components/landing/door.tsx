"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { COLORS, DOOR, DOOR_STYLE, DOORWAY, DZ, MZ, TRAVEL } from "./landing-config";
import { disposeTree, doorOpenAt, glowTexture, rbox, smooth, solid } from "./scene-utils";
import { useTravel } from "./travel-state";

/**
 * The museum's main door, neoclassical: two tall wooden leaves with three
 * raised panels each and long brass pulls, a moulded architrave, a glowing
 * semicircular fanlight and a cornice hood. The leaves are hinged on their
 * outer edges and swing INTO a lit passage cut through the building (see
 * DOORWAY), so nothing clips; the camera then walks into that light.
 * Leaves and glow are the click target for "enter" (LANDING_SPEC §3.2, §4.5).
 */
export function Door({ onEnter }: { onEnter: () => void }) {
  const travel = useTravel();
  const parts = useMemo(() => {
    const root = new THREE.Group();
    const wood = solid(COLORS.door, 0.55);
    const panelShadow = solid(COLORS.doorPanelShadow, 0.6);
    const panelFace = solid(COLORS.doorPanel, 0.5);
    const brass = solid(COLORS.doorKnob, 0.3, 1);
    const trim = solid(COLORS.trim, 0.7);
    const light = new THREE.MeshBasicMaterial({ color: COLORS.doorLight, toneMapped: false });
    const fan = new THREE.MeshBasicMaterial({ color: COLORS.fanlight, toneMapped: false });

    const hw = DOORWAY.halfWidth;
    const { leafWidth: lw, leafHeight: lh, leafDepth: ld } = DOOR;

    // ── Lit passage behind the doorway: floor, sides, ceiling, back. ─────────
    const passageZ0 = MZ + 1; // front face of the portico wall
    const depth = DOORWAY.depth;
    const ph = DOORWAY.topY - DOORWAY.floorY;
    const pc = (DOORWAY.topY + DOORWAY.floorY) / 2;
    const plane = (w: number, h: number, x: number, y: number, z: number, rx: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), light);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      root.add(m);
    };
    // Inset a little from the cut wall faces: coplanar faces z-fight, which
    // shows as grey staircase patterns when the camera walks in.
    const inset = 0.03;
    const pw = (hw - inset) * 2;
    plane(pw, depth, 0, DOORWAY.floorY + inset, passageZ0 - depth / 2, -Math.PI / 2, 0);
    plane(pw, depth, 0, DOORWAY.topY - inset, passageZ0 - depth / 2, Math.PI / 2, 0);
    plane(depth, ph, -hw + inset, pc, passageZ0 - depth / 2, 0, Math.PI / 2);
    plane(depth, ph, hw - inset, pc, passageZ0 - depth / 2, 0, -Math.PI / 2);
    plane(pw, ph, 0, pc, passageZ0 - depth, 0, 0);

    // ── Architrave: jambs, head casing with a small cornice. ────────────────
    const { jambWidth: jw, jambDepth: jd } = DOOR_STYLE;
    const jambH = DOORWAY.topY - DOORWAY.floorY + jw;
    for (const sx of [-1, 1]) {
      rbox(root, jw, jambH, jd, trim, sx * (hw + jw / 2 - 0.05), DOORWAY.floorY + jambH / 2, passageZ0 + jd / 2, 0.04);
    }
    rbox(root, hw * 2 + jw * 2 + 0.3, 0.32, jd + 0.12, trim, 0, DOORWAY.topY + jw + 0.1, passageZ0 + jd / 2 + 0.06, 0.04);

    // ── Fanlight: glowing half disc, radiating glazing bars, moulded arch. ──
    const fr = DOOR_STYLE.fanlightRadius;
    const fy = DOOR_STYLE.fanlightY;
    const fz = passageZ0 + 0.03;
    const glass = new THREE.Mesh(new THREE.CircleGeometry(fr, 48, 0, Math.PI), fan);
    glass.position.set(0, fy, fz);
    root.add(glass);
    for (let i = 1; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, fr, 0.06), trim);
      bar.position.set((Math.cos(a) * fr) / 2, fy + (Math.sin(a) * fr) / 2, fz + 0.03);
      bar.rotation.z = a - Math.PI / 2;
      root.add(bar);
    }
    const hub = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24, 0, Math.PI), trim);
    hub.position.set(0, fy, fz + 0.05);
    root.add(hub);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(fr + 0.1, 0.13, 10, 48, Math.PI), trim);
    arch.position.set(0, fy, fz + 0.08);
    arch.castShadow = true;
    root.add(arch);
    rbox(root, fr * 2 + 0.6, 0.22, 0.3, trim, 0, fy - 0.08, fz + 0.12, 0.04);

    // ── Cornice hood above the fanlight. ────────────────────────────────────
    rbox(root, fr * 2 + 1.4, 0.3, 0.7, trim, 0, DOOR_STYLE.hoodY, passageZ0 + 0.35, 0.05);
    rbox(root, fr * 2 + 1.0, 0.18, 0.5, trim, 0, DOOR_STYLE.hoodY - 0.22, passageZ0 + 0.25, 0.04);

    // ── Leaves, hinged on their outer edges. ────────────────────────────────
    const leaf = (hingeX: number, dir: 1 | -1) => {
      const g = new THREE.Group();
      g.position.set(hingeX, DOOR.y, DZ);
      const cx = dir * (lw / 2);
      rbox(g, lw, lh, ld, wood, cx, 0, 0, 0.03);
      // Raised panels on the front face: recess, moulding, raised field.
      for (const [h, y] of DOOR_STYLE.panels) {
        const w = lw - DOOR_STYLE.panelInset * 2;
        rbox(g, w, h, 0.04, panelShadow, cx, y, ld / 2 + 0.01, 0.015);
        rbox(g, w - 0.12, h - 0.12, 0.06, wood, cx, y, ld / 2 + 0.03, 0.02);
        rbox(g, w - 0.34, h - 0.34, 0.08, panelFace, cx, y, ld / 2 + 0.05, 0.03);
      }
      // Long brass pull near the meeting edge, with two mounts.
      const pullX = dir * (lw - 0.24);
      const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 12), brass);
      pull.position.set(pullX, 0.25, ld / 2 + 0.16);
      g.add(pull);
      for (const y of [0.75, -0.25]) {
        const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8), brass);
        mount.rotation.x = Math.PI / 2;
        mount.position.set(pullX, y, ld / 2 + 0.08);
        g.add(mount);
      }
      // Kick plate at the bottom.
      rbox(g, lw - 0.2, 0.22, 0.03, brass, cx, -lh / 2 + 0.2, ld / 2 + 0.015, 0.01);
      root.add(g);
      return g;
    };
    const left = leaf(-lw, 1);
    const right = leaf(lw, -1);
    // Astragal: the moulding strip that covers the meeting edge, on the right leaf.
    rbox(right, 0.12, lh - 0.1, 0.06, wood, -lw + 0.04, 0, ld / 2 + 0.03, 0.02);

    const lamp = new THREE.PointLight(COLORS.doorLamp, 0, 20, 1.5);
    lamp.position.set(0, 4.8, DZ + 1.6);
    root.add(lamp);

    // The glow is a flat plane parallel to the door, not a sprite: a sprite
    // faces the camera, so when the camera looks up at the door its lower half
    // tilts behind the leaves and gets cut off by the panels (a hard, stepped
    // "shadow" across the bottom of the door).
    const tex = glowTexture();
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
      }),
    );
    glow.scale.set(DOOR.glowScale, DOOR.glowScale, 1);
    // In front of the raised panels and pulls, behind the jambs' front face.
    glow.position.set(0, DOOR.y, DZ + 0.3);
    glow.renderOrder = 1;
    root.add(glow);
    return { root, left, right, lamp, glow, tex };
  }, []);
  useEffect(
    () => () => {
      disposeTree(parts.root);
      parts.tex.dispose();
    },
    [parts],
  );

  useFrame(({ clock }) => {
    const now = clock.getElapsedTime();
    const pulse = travel.reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(now * 2.2);
    const idle = travel.phase === "idle";
    const open = idle ? 0 : doorOpenAt(travel.t);
    // Light floods from the passage as the camera walks in.
    const flood = idle ? 0 : smooth(TRAVEL.white[0], TRAVEL.white[1], travel.t);
    // Positive rotation swings the left leaf's free edge to -z (into the building); the right leaf mirrors it.
    parts.left.rotation.y = open * DOOR.openAngle;
    parts.right.rotation.y = -open * DOOR.openAngle;
    parts.lamp.intensity = open * DOOR.lampIntensity * (1 + flood * 2);
    parts.glow.material.opacity = flood > 0 ? 1 : (travel.hovering ? 1 : 0.7) * pulse;
    const g = DOOR.glowScale + open * DOOR.glowGrow + flood * DOOR.glowFlood;
    parts.glow.scale.set(g, g, 1);
  });

  const setHover = (on: boolean) => (e: ThreeEvent<PointerEvent>) => {
    if (travel.phase !== "idle") return;
    e.stopPropagation();
    travel.hovering = on;
    document.body.style.cursor = on ? "pointer" : "";
  };
  useEffect(() => () => void (document.body.style.cursor = ""), []);

  return (
    <primitive
      object={parts.root}
      onPointerOver={setHover(true)}
      onPointerOut={setHover(false)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        travel.hovering = false;
        document.body.style.cursor = "";
        onEnter();
      }}
    />
  );
}
