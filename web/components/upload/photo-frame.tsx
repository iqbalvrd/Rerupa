import type { ReactNode } from "react";
import { FramedArt } from "@/components/gallery/framed-art";
import styles from "./upload.module.css";

/** The photo sets the ratio; only its display size is limited to the available space. */
export function PhotoFrame({ children, maxHeight = "56dvh" }: { children: ReactNode; maxHeight?: string }) {
  return (
    <div className={styles.photoStage}>
      <FramedArt maxWidth="min(calc(100cqi - 2 * var(--frame-w)), 34rem)" maxHeight={maxHeight}>
        {children}
      </FramedArt>
    </div>
  );
}
