"use client";

/**
 * StageCanvas: the guide for one stage, drawn as a single SVG in the lesson's
 * image_width × image_height space (every layer shares it, API.md).
 *
 * Order, bottom to top (RENCANA §4.5): paper → colour regions painted so far
 * (flat) → light-dark → sketch → line art → main object → grid → outline and
 * number of this stage's new regions → original photo (only when asked).
 * New regions are marked by a dashed outline and a number, never by colour
 * alone. Pinch, drag and the zoom buttons work through react-zoom-pan-pinch.
 */
import { useQuery } from "@tanstack/react-query";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchContentRef } from "react-zoom-pan-pinch";
import type { Lesson, Stage } from "@/lib/schemas";
import { parseRegionsSvg, regionNumber, regionsByCode, type LayerKey } from "@/lib/stages";
import styles from "./practice.module.css";

export type StageCanvasHandle = {
  zoomToFocus: () => void;
  reset: () => void;
};

type Props = {
  lesson: Lesson;
  stage: Stage;
  painted: Set<string>;
  visible: Record<LayerKey, boolean>;
  /** Called when a signed layer URL failed to load (likely expired): refetch the lesson. */
  onLayerError: () => void;
};

export const StageCanvas = forwardRef<StageCanvasHandle, Props>(function StageCanvas(
  { lesson, stage, painted, visible, onLayerError },
  ref,
) {
  const W = lesson.image_width;
  const H = lesson.image_height;
  const transform = useRef<ReactZoomPanPinchContentRef>(null);
  const focusRect = useRef<SVGRectElement>(null);
  const layer = (kind: string) => lesson.layers.find((l) => l.kind === kind);
  const regionsLayer = layer("regions");

  // regions.svg holds one <path id="rNN"> per region; parse it so each region
  // can be shown, hidden and highlighted on its own.
  const regionPaths = useQuery({
    queryKey: ["regions-svg", regionsLayer?.url],
    enabled: Boolean(regionsLayer?.url),
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const res = await fetch(regionsLayer!.url!, { signal });
      if (!res.ok) throw new Error(`regions.svg ${res.status}`);
      return parseRegionsSvg(await res.text(), new DOMParser());
    },
    retry: 1,
  });
  const regions = useMemo(() => regionsByCode(lesson.regions), [lesson.regions]);
  const paths = regionPaths.data;
  const newCodes = stage.new_region_codes;

  useImperativeHandle(ref, () => ({
    zoomToFocus: () => {
      if (focusRect.current) transform.current?.zoomToElement(focusRect.current as unknown as HTMLElement, undefined, 400);
    },
    reset: () => transform.current?.resetTransform(400),
  }));

  // Painted regions in lesson order (largest first from the backend), so small ones sit on top.
  const paintedOrdered = lesson.regions.filter((r) => painted.has(r.code));
  const imageLayer = (kind: LayerKey, extra?: React.SVGProps<SVGImageElement>) => {
    const l = layer(kind);
    if (!visible[kind] || !l?.url) return null;
    return (
      <image
        key={kind}
        href={l.url}
        x={0}
        y={0}
        width={W}
        height={H}
        preserveAspectRatio="none"
        onError={onLayerError}
        {...extra}
      />
    );
  };
  const focus = stage.focus_bbox;

  return (
    <TransformWrapper ref={transform} minScale={1} maxScale={6} centerOnInit doubleClick={{ mode: "toggle", step: 2 }}>
      <TransformComponent wrapperClass={styles.canvasWrap} contentClass={styles.canvasContent}>
        <svg
          className={styles.canvas}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Panduan ${stage.title}. ${newCodes.length ? `Bidang baru: nomor ${newCodes.map(regionNumber).join(", ")}.` : ""}`}
        >
          <rect width={W} height={H} fill="#fffdf8" />

          {visible.regions &&
            (paths
              ? paintedOrdered.map((r) =>
                  paths.has(r.code) ? (
                    <path key={r.code} d={paths.get(r.code)} fill={r.hex} stroke={r.hex} strokeWidth={1} strokeLinejoin="round" fillRule="evenodd" />
                  ) : null,
                )
              : // regions.svg could not be parsed: show the whole layer once a region is painted.
                painted.size > 0 && regionsLayer?.url && (
                  <image href={regionsLayer.url} width={W} height={H} preserveAspectRatio="none" onError={onLayerError} />
                ))}

          {imageLayer("value", { opacity: 0.55, style: { mixBlendMode: "multiply" } })}
          {imageLayer("sketch")}
          {imageLayer("lineart")}
          {imageLayer("main_object")}
          {imageLayer("grid", { opacity: 0.7 })}

          {/* This stage's new regions: dashed outline + number (never colour alone). */}
          {newCodes.map((code) => {
            const r = regions.get(code);
            if (!r) return null;
            const d = paths?.get(code);
            return (
              <g key={`hl-${code}`} className={styles.highlight}>
                {d ? (
                  <>
                    <path d={d} fill="none" stroke="#fff" strokeWidth={6} strokeLinejoin="round" />
                    <path d={d} fill="none" stroke="#1b1712" strokeWidth={3} strokeDasharray="10 7" strokeLinejoin="round" />
                  </>
                ) : (
                  <rect x={r.bbox[0]} y={r.bbox[1]} width={r.bbox[2]} height={r.bbox[3]} fill="none" stroke="#1b1712" strokeWidth={3} strokeDasharray="10 7" />
                )}
              </g>
            );
          })}
          {newCodes.map((code) => {
            const r = regions.get(code);
            if (!r) return null;
            const size = Math.max(W, H) * 0.035;
            return (
              <g key={`n-${code}`} transform={`translate(${r.centroid[0]} ${r.centroid[1]})`}>
                <circle r={size} fill="#1b1712" stroke="#fff" strokeWidth={size * 0.18} />
                <text textAnchor="middle" dominantBaseline="central" fontSize={size * 1.05} fontWeight={700} fill="#fff">
                  {regionNumber(code)}
                </text>
              </g>
            );
          })}

          {imageLayer("original_photo", { preserveAspectRatio: "xMidYMid slice" })}

          {/* Invisible target for "Zoom ke area ini". */}
          {focus && <rect ref={focusRect} x={focus[0]} y={focus[1]} width={focus[2]} height={focus[3]} fill="none" />}
        </svg>
      </TransformComponent>
    </TransformWrapper>
  );
});
