"use client";

/**
 * The line layer that is new in this step, drawn stroke by stroke (v2
 * "tutorial bertahap": new lines black and animated, older lines grey).
 *
 * The layer is an SVG from our own storage. It is never injected as markup:
 * only drawable shapes and their geometry are copied out (with the transforms
 * of their parent groups), then drawn with `pathLength=1` so one dash
 * animation draws any shape. PNG layers (the selected detail lines) cannot be
 * traced, so they are wiped in from the left instead. Reduced motion shows the
 * finished lines at once (CSS).
 */
import { useQuery } from "@tanstack/react-query";
import type { Layer } from "@/lib/schemas";
import styles from "./practice.module.css";

type Shape = { tag: "path" | "line" | "polyline" | "polygon" | "circle" | "ellipse" | "rect"; attrs: Record<string, string> };

const DRAWABLE = ["path", "line", "polyline", "polygon", "circle", "ellipse", "rect"] as const;
const GEOMETRY = ["d", "points", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "x", "y", "width", "height"];
/** Most shapes start drawing within this many seconds, so long layers do not take forever. */
const SPREAD_S = 1.6;

export function parseLineShapes(text: string, parser: DOMParser): Shape[] {
  const doc = parser.parseFromString(text, "image/svg+xml");
  if (doc.querySelector("parsererror")) return [];
  const shapes: Shape[] = [];
  for (const el of doc.querySelectorAll(DRAWABLE.join(","))) {
    const tag = el.tagName.toLowerCase() as Shape["tag"];
    const attrs: Record<string, string> = {};
    for (const name of GEOMETRY) {
      const v = el.getAttribute(name);
      if (v !== null) attrs[name] = v;
    }
    // Carry the transforms of the shape and its groups, outermost first.
    const transforms: string[] = [];
    for (let n: Element | null = el; n && n.tagName.toLowerCase() !== "svg"; n = n.parentElement) {
      const t = n.getAttribute("transform");
      if (t) transforms.unshift(t);
    }
    if (transforms.length) attrs.transform = transforms.join(" ");
    let width: string | null = null;
    for (let n: Element | null = el; n && !width; n = n.parentElement) width = n.getAttribute("stroke-width");
    if (width) attrs["stroke-width"] = width;
    shapes.push({ tag, attrs });
  }
  return shapes;
}

export function DrawnLines({ layer, width, height, onError }: { layer: Layer; width: number; height: number; onError: () => void }) {
  const isSvg = layer.format === "svg" || /\.svg(\?|$)/.test(layer.url ?? "");
  const shapes = useQuery({
    queryKey: ["line-layer", layer.url],
    enabled: Boolean(layer.url) && isSvg,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const res = await fetch(layer.url!, { signal });
      if (!res.ok) throw new Error(`${layer.kind} ${res.status}`);
      return parseLineShapes(await res.text(), new DOMParser());
    },
    retry: 1,
  });

  if (!layer.url) return null;
  if (!isSvg || shapes.isError) {
    return (
      <image
        className={styles.wipeIn}
        href={layer.url}
        width={width}
        height={height}
        preserveAspectRatio="none"
        onError={onError}
      />
    );
  }
  const list = shapes.data ?? [];
  const step = list.length > 1 ? SPREAD_S / list.length : 0;
  const base = Math.max(width, height) * 0.004;
  return (
    <g className={styles.drawn} fill="none" stroke="#14110d" strokeLinecap="round" strokeLinejoin="round">
      {list.map(({ tag, attrs }, i) => {
        const Tag = tag;
        const { ["stroke-width"]: sw, ...geometry } = attrs;
        return (
          <Tag
            key={i}
            {...geometry}
            pathLength={1}
            strokeWidth={Math.max(base, Number(sw) || 0) * 1.15}
            style={{ animationDelay: `${(i * step).toFixed(3)}s` }}
          />
        );
      })}
    </g>
  );
}
