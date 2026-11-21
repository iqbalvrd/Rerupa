/**
 * Picture frame styles, drawn with CSS `border-image` (9-slice). The middle of
 * the image is discarded, so the artwork shows through the opening.
 *
 * Sources (CC0, Poly Haven, rendered front-on to PNG then WebP):
 * - louis-xiv: "Fancy Picture Frame 01/02" by Rob Tuytel (scan) & Rico Cilliers (model)
 *   https://polyhaven.com/a/fancy_picture_frame_02
 * - louis-xvi: https://polyhaven.com/a/fancy_picture_frame_01
 * `slice` is measured in pixels of the WebP file: top, right, bottom, left.
 */
export type FrameStyleId = "louis-xiv" | "louis-xvi";

export type FrameStyle = {
  id: FrameStyleId;
  label: string;
  src: string;
  slice: [number, number, number, number];
  /** Rendered border thickness relative to the artwork's shorter side. */
  thickness: number;
};

export const FRAME_STYLES: Record<FrameStyleId, FrameStyle> = {
  "louis-xiv": {
    id: "louis-xiv",
    label: "Emas berukir (Louis XIV)",
    src: "/gallery/frame-louis-xiv.webp",
    slice: [149, 144, 150, 148],
    thickness: 0.2,
  },
  "louis-xvi": {
    id: "louis-xvi",
    label: "Emas klasik (Louis XVI)",
    src: "/gallery/frame-louis-xvi.webp",
    slice: [50, 50, 51, 50],
    thickness: 0.09,
  },
};

export const DEFAULT_FRAME: FrameStyleId = "louis-xiv";
