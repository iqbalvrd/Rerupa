import type { CSSProperties, ReactNode, Ref } from "react";
import { HERO_TRANSITION_NAME } from "@/lib/view-transition";
import { DEFAULT_FRAME, FRAME_STYLES, type FrameStyleId } from "./frames";
import styles from "./framed-art.module.css";

function frameVars(id: FrameStyleId, maxW?: string, maxH?: string): CSSProperties {
  const frame = FRAME_STYLES[id];
  return {
    "--frame-src": `url("${frame.src}")`,
    "--frame-slice": frame.slice.join(" "),
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
  if (hero) style.viewTransitionName = HERO_TRANSITION_NAME;
  return (
    <span
      ref={frameRef}
      className={[styles.frame, className].filter(Boolean).join(" ")}
      style={style}
      data-artwork-hero={hero ? "" : undefined}
      data-gallery-frame={gallerySlug}
    >
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
  );
}
