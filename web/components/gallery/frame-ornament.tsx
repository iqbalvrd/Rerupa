import { useId } from "react";
import styles from "./framed-art.module.css";

export const CORNER_SCROLL = "M16 64C-3 55 0 28 18 20C35 12 50 24 44 36C39 47 24 43 25 34C25 26 35 27 36 32C32 20 14 24 14 36C13 49 28 55 44 48C66 39 54 13 43 8C61 8 72 17 70 32C83 23 86 8 82 3C99 21 90 40 70 48C92 49 100 61 94 75C88 92 73 88 70 79C67 69 79 65 82 73C78 64 66 72 72 82C77 92 91 91 97 82C97 98 76 104 62 92C49 80 59 63 66 59C48 66 30 80 16 64Z";
export const CORNER_LEAF = "M15 59C5 65 6 77 13 85C13 74 21 77 23 70C24 85 33 92 45 94C35 85 42 82 34 74C49 81 56 73 64 60C51 66 49 56 38 63C43 48 37 44 30 42C32 51 21 49 15 59Z";
export const CENTER_SCROLL = "M70 34C54 4 18 6 12 24C8 36 25 45 32 35C37 27 27 21 23 27C23 20 13 21 15 29C20 43 42 33 46 27C48 45 60 41 70 52C80 41 92 45 94 27C98 33 120 43 125 29C127 21 117 20 117 27C113 21 103 27 108 35C115 45 132 36 128 24C122 6 86 4 70 34Z";
export const CENTER_LEAF = "M70 5C61 10 65 18 57 23C58 36 65 40 70 46C75 40 82 36 83 23C75 18 79 10 70 5Z";

export const CORNER_ENGRAVING = "M19 61C32 69 42 64 56 54M20 63C22 73 30 78 36 84M25 60L32 52M29 65L40 69M30 69L40 74M52 44C64 33 62 22 54 17M72 54C85 57 91 66 88 74M6 21C10 8 23 4 36 9";
export const CORNER_SHINE = "M19 60C32 68 42 63 56 53M20 62C22 72 30 77 36 83M54 42C63 33 61 23 55 19";
export const CENTER_ENGRAVING = "M70 14V40M68 32L62 26M72 32L78 26M41 20C55 18 59 32 66 36M99 20C85 18 81 32 74 36";
export const CENTER_SHINE = "M69 13V38M40 18C54 17 59 30 65 34M100 18C86 17 81 30 75 34";
/** Gilding gradient stops, shared with the 3D gallery's frame texture. */
export const GILDING: [number, string][] = [
  [0, "#f9dfa0"],
  [0.22, "#d8b46b"],
  [0.44, "#9b672e"],
  [0.57, "#f2cc7c"],
  [0.78, "#ae793a"],
  [1, "#62401e"],
];

/** Each relief keeps its own aspect ratio while the frame rails change length. */
export function FrameOrnament({ corner, className }: { corner?: boolean; className: string }) {
  const id = useId().replace(/:/g, "");
  const paths = corner ? [CORNER_SCROLL, CORNER_LEAF] : [CENTER_SCROLL, CENTER_LEAF];
  return (
    <svg className={className} viewBox={corner ? "0 0 102 102" : "0 0 140 58"}
      aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.7" y2="1">
          {GILDING.map(([offset, color]) => <stop key={offset} offset={offset} stopColor={color} />)}
        </linearGradient>
      </defs>
      <g strokeLinejoin="round">
        {paths.map((d) => <path key={d} d={d} fill={`url(#${id})`}
          stroke="#67421f" strokeWidth="3.1" />)}
        {paths.map((d) => <path key={d} d={d} fill="none"
          stroke="#f6d992" strokeWidth="1.1" transform="translate(-.7 -1)" />)}
        {corner ? (
          <g fill="none" strokeLinecap="round">
            <path className={styles.engraving} d={CORNER_ENGRAVING} />
            <path d={CORNER_SHINE}
              stroke="#f3d28b" strokeWidth="1.3" />
            <circle cx="13" cy="13" r="5.7" fill={`url(#${id})`} stroke="#855b2a" strokeWidth="1.2" />
          </g>
        ) : (
          <g fill="none" strokeLinecap="round">
            <path className={styles.engraving} d={CENTER_ENGRAVING} />
            <path d={CENTER_SHINE}
              stroke="#f7d993" strokeWidth="1.2" />
          </g>
        )}
      </g>
    </svg>
  );
}
