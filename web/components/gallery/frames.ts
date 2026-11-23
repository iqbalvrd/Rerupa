/** The two existing presets share the procedural gilded profile. */
export type FrameStyleId = "louis-xiv" | "louis-xvi";

export type FrameStyle = {
  id: FrameStyleId;
  label: string;
  /** Rendered border thickness relative to the artwork's shorter side. */
  thickness: number;
};

export const FRAME_STYLES: Record<FrameStyleId, FrameStyle> = {
  "louis-xiv": {
    id: "louis-xiv",
    label: "Emas berukir (Louis XIV)",
    thickness: 0.1,
  },
  "louis-xvi": {
    id: "louis-xvi",
    label: "Emas klasik (Louis XVI)",
    thickness: 0.045,
  },
};

export const DEFAULT_FRAME: FrameStyleId = "louis-xiv";
