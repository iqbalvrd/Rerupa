"use client";

/**
 * Tap the 4 corners of the grid area on a progress photo (API.md: corners in
 * natural photo pixels, order free). Tap the photo to place a corner; drag a
 * corner to adjust it; or focus a corner and use the arrow keys (Shift for
 * bigger steps). "Pakai seluruh foto" offers a no-drag alternative.
 */
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { clamp, polygonOrder, toNatural, type Point } from "@/lib/corners";
import styles from "./checkpoint.module.css";

type Props = {
  src: string;
  natural: { width: number; height: number };
  points: Point[];
  onChange: (points: Point[]) => void;
};

export function CornerPicker({ src, natural, points, onChange }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");

  const place = (e: PointerEvent<HTMLImageElement>) => {
    if (e.button !== 0 || points.length >= 4 || !imgRef.current) return;
    const p = toNatural(e.clientX, e.clientY, imgRef.current.getBoundingClientRect(), natural);
    const next = [...points, p];
    onChange(next);
    setAnnounce(next.length === 4 ? "Keempat sudut sudah dipasang." : `Sudut ${next.length} dari 4 dipasang.`);
  };

  const startDrag = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(i);
  };
  const drag = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !imgRef.current) return;
    const p = toNatural(e.clientX, e.clientY, imgRef.current.getBoundingClientRect(), natural);
    onChange(points.with(i, p));
  };
  const endDrag = (i: number) => () => {
    if (dragging === i) {
      setDragging(null);
      setAnnounce(`Sudut ${i + 1} dipindahkan.`);
    }
  };

  const nudge = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = (e.shiftKey ? 0.025 : 0.005) * Math.max(natural.width, natural.height);
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    const p = points[i];
    onChange(points.with(i, { x: clamp(p.x + d[0], 0, natural.width), y: clamp(p.y + d[1], 0, natural.height) }));
  };

  const outline = polygonOrder(points);
  const stroke = Math.max(natural.width, natural.height) * 0.004;

  return (
    <div className={styles.photoStage}>
      <div className={styles.photoBox}>
        {/* Object URL of the user's own photo; next/image cannot optimise it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt="Foto progresmu. Ketuk keempat sudut area grid."
          className={styles.photo}
          width={natural.width}
          height={natural.height}
          draggable={false}
          onPointerDown={place}
        />
        <svg className={styles.overlay} viewBox={`0 0 ${natural.width} ${natural.height}`} preserveAspectRatio="none" aria-hidden="true">
          {outline.length >= 2 && (
            <polygon
              points={outline.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={outline.length === 4 ? "rgb(255 214 160 / 0.18)" : "none"}
              stroke="#fff"
              strokeWidth={stroke * 1.8}
              strokeLinejoin="round"
            />
          )}
          {outline.length >= 2 && (
            <polygon
              points={outline.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#0f1b33"
              strokeWidth={stroke}
              strokeDasharray={`${stroke * 4} ${stroke * 3}`}
              strokeLinejoin="round"
            />
          )}
        </svg>
        {points.map((p, i) => (
          <button
            key={i}
            type="button"
            className={styles.handle}
            data-dragging={dragging === i}
            style={{ left: `${(p.x / natural.width) * 100}%`, top: `${(p.y / natural.height) * 100}%` }}
            aria-label={`Sudut ${i + 1}. Geser, atau pakai tombol panah untuk memindahkan.`}
            onPointerDown={startDrag(i)}
            onPointerMove={drag(i)}
            onLostPointerCapture={endDrag(i)}
            onKeyDown={nudge(i)}
          >
            <span aria-hidden="true">{i + 1}</span>
          </button>
        ))}
      </div>
      <p className={styles.visuallyHidden} aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
