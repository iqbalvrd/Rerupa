"use client";

/**
 * Pick the practice area on a free-mode photo. Drag inside the box to move it,
 * drag a corner to resize it, or use the keyboard: arrow keys on the box move
 * it, arrow keys on a corner resize from that corner (Shift for bigger steps).
 */
import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { moveBox, resizeBox, type Box, type CornerId } from "@/lib/crop";
import { PhotoFrame } from "./photo-frame";
import styles from "./upload.module.css";

const CORNERS: { id: CornerId; label: string }[] = [
  { id: "nw", label: "Sudut kiri atas" },
  { id: "ne", label: "Sudut kanan atas" },
  { id: "se", label: "Sudut kanan bawah" },
  { id: "sw", label: "Sudut kiri bawah" },
];

type Drag = { kind: "move" | CornerId; startX: number; startY: number; startBox: Box };

export function CropBox({
  src,
  width,
  height,
  box,
  onChange,
}: {
  src: string;
  width: number;
  height: number;
  box: Box;
  onChange: (box: Box) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const start = (kind: Drag["kind"]) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind, startX: e.clientX, startY: e.clientY, startBox: box };
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || !e.currentTarget.hasPointerCapture(e.pointerId) || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const dx = (e.clientX - d.startX) / rect.width;
    const dy = (e.clientY - d.startY) / rect.height;
    onChange(d.kind === "move" ? moveBox(d.startBox, dx, dy) : resizeBox(d.startBox, d.kind, dx, dy));
  };
  const end = () => {
    drag.current = null;
  };

  const keys = (kind: Drag["kind"]) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    onChange(kind === "move" ? moveBox(box, d[0], d[1]) : resizeBox(box, kind, d[0], d[1]));
  };

  const pct = (n: number) => `${n * 100}%`;
  return (
    <PhotoFrame>
      <div ref={frameRef} className={styles.cropFrame}>
        {/* Object URL of the user's own photo; next/image cannot optimise it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Foto karyamu" className={styles.cropPhoto} width={width} height={height} draggable={false} />
        <div className={styles.cropBox} style={{ left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h) }}>
          <button
            type="button"
            className={styles.moveArea}
            aria-label="Area latihan. Geser, atau pakai tombol panah untuk memindahkan."
            onPointerDown={start("move")}
            onPointerMove={move}
            onLostPointerCapture={end}
            onKeyDown={keys("move")}
          />
          {CORNERS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`${styles.cropHandle} ${styles[c.id]}`}
              aria-label={`${c.label} area latihan. Geser, atau pakai tombol panah untuk mengubah ukuran.`}
              onPointerDown={start(c.id)}
              onPointerMove={move}
              onLostPointerCapture={end}
              onKeyDown={keys(c.id)}
            />
          ))}
        </div>
      </div>
    </PhotoFrame>
  );
}
