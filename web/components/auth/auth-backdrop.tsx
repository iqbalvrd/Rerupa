import { FrameOrnament } from "@/components/gallery/frame-ornament";
import styles from "./auth.module.css";

/** One kawung flower: four petals pointing to the diagonals, a small dot at its heart. */
function Kawung({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {[45, 135, 225, 315].map((angle) => (
        <g key={angle} transform={`rotate(${angle})`}>
          <ellipse cx="11" cy="0" rx="9.5" ry="5.6" />
          <ellipse cx="11" cy="0" rx="4.6" ry="1.7" className={styles.petalCore} />
        </g>
      ))}
      <circle r="1.6" className={styles.petalCore} />
    </g>
  );
}

/**
 * Background of the sign-in and sign-up pages: a faint kawung batik on the gallery's wall colour.
 * Inline SVG (no image request), drawn once as a repeating pattern, decorative only.
 */
export function AuthBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <svg className={styles.pattern} width="100%" height="100%">
        <defs>
          <pattern id="rerupa-kawung" width="44" height="44" patternUnits="userSpaceOnUse">
            <g className={styles.kawung}>
              <Kawung x={22} y={22} />
              {[0, 44].flatMap((x) => [0, 44].map((y) => <Kawung key={`${x}-${y}`} x={x} y={y} />))}
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#rerupa-kawung)" />
      </svg>
      <div className={styles.glow} />
    </div>
  );
}

/** Cream card with the gallery frame's carved gold corners and a crest above the title. */
export function OrnateCard({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.card}>
      <FrameOrnament corner className={`${styles.corner} ${styles.cornerTL}`} />
      <FrameOrnament corner className={`${styles.corner} ${styles.cornerTR}`} />
      <FrameOrnament corner className={`${styles.corner} ${styles.cornerBR}`} />
      <FrameOrnament corner className={`${styles.corner} ${styles.cornerBL}`} />
      <FrameOrnament className={styles.crest} />
      {children}
    </div>
  );
}
