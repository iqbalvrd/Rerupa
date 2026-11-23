"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { HERO_TRANSITION_NAME } from "@/lib/view-transition";
import { DEFAULT_FRAME, FRAME_STYLES, type FrameStyleId } from "./frames";
import styles from "./framed-art.module.css";
import { FrameOrnament } from "./frame-ornament";

function frameVars(id: FrameStyleId, maxW?: string, maxH?: string): CSSProperties {
  const frame = FRAME_STYLES[id];
  return {
    "--frame-w": `clamp(1rem, calc(${frame.thickness} * min(52vw, 30dvh)), 4rem)`,
    ...(maxW ? { "--art-max-w": maxW } : {}),
    ...(maxH ? { "--art-max-h": maxH } : {}),
  } as CSSProperties;
}

type FramedArtProps = {
  frame?: FrameStyleId;
  /** Override the artwork's maximum size, e.g. larger on the detail page. */
  maxWidth?: string;
  maxHeight?: string;
  className?: string;
  /** The frame element (frame + artwork), the unit that moves in gallery ↔ artwork transitions. */
  frameRef?: Ref<HTMLSpanElement>;
  /** Detail page: this frame is the shared element of the walk-up transition. */
  hero?: boolean;
  /** Gallery: which artwork this frame shows, so the walk-back transition can find it. */
  gallerySlug?: string;
} & (
  | {
      src: string;
      alt: string;
      width?: number;
      height?: number;
      priority?: boolean;
      children?: never;
    }
  | { children: ReactNode; src?: never }
);

export function FramedArt(props: FramedArtProps) {
  const { frame = DEFAULT_FRAME, maxWidth, maxHeight, className, frameRef, hero, gallerySlug } = props;
  const style = frameVars(frame, maxWidth, maxHeight);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [frameWidth, setFrameWidth] = useState<number>();
  const measure = useCallback(() => {
    const content = contentRef.current?.firstElementChild;
    if (!(content instanceof HTMLElement)) return;
    const width = content.offsetWidth;
    const height = content.offsetHeight;
    if (!width || !height) return;
    const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const thickness = FRAME_STYLES[frame].thickness;
    const next = Math.max(rootFont, Math.min(rootFont * 4, Math.min(width, height) * thickness));
    setFrameWidth((previous) => previous !== undefined && Math.abs(previous - next) < 0.5 ? previous : next);
  }, [frame]);
  useEffect(() => {
    const content = contentRef.current?.firstElementChild;
    if (!content) return;
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    measure();
    return () => observer.disconnect();
  }, [measure, props.src]);
  if (frameWidth !== undefined) (style as Record<string, string | number>)["--frame-w"] = `${frameWidth}px`;
  if (hero) style.viewTransitionName = HERO_TRANSITION_NAME;
  return (
    <span
      ref={frameRef}
      className={[styles.frame, className].filter(Boolean).join(" ")}
      style={style}
      data-artwork-hero={hero ? "" : undefined}
      data-gallery-frame={gallerySlug}
    >
      <span className={styles.rails} aria-hidden="true">
        <span className={styles.top} /><span className={styles.right} />
        <span className={styles.bottom} /><span className={styles.left} />
      </span>
      <span className={styles.ornaments} aria-hidden="true">
        <FrameOrnament corner className={styles.cornerTL} />
        <FrameOrnament corner className={styles.cornerTR} />
        <FrameOrnament corner className={styles.cornerBR} />
        <FrameOrnament corner className={styles.cornerBL} />
        <FrameOrnament className={styles.crownTop} />
        <FrameOrnament className={styles.crownBottom} />
        <FrameOrnament className={styles.crownLeft} />
        <FrameOrnament className={styles.crownRight} />
      </span>
      <span className={styles.content} ref={contentRef}>
      {props.src !== undefined ? (
        // Signed Supabase URLs change per request, so next/image optimization is not used.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.art}
          src={props.src}
          alt={props.alt}
          width={props.width}
          height={props.height}
          decoding="async"
          {...(props.priority ? { fetchPriority: "high" as const } : { loading: "lazy" as const })}
        />
      ) : (
        props.children
      )}
      </span>
    </span>
  );
}
