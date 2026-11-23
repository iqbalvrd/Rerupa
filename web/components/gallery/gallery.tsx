"use client";

import { useEffect, useState } from "react";
import { MuseumGallery } from "./museum-gallery";
import { GalleryRoom } from "./room/gallery-room";

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * The gallery is a 3D room you walk around in. Without WebGL it falls back to
 * the flat wall: one artwork per screen, swiped through (MuseumGallery).
 */
export function Gallery() {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  useEffect(() => setWebgl(supportsWebGL()), []);
  if (webgl === null) return <div style={{ blockSize: "100dvh", background: "#ece4d6" }} />;
  return webgl ? <GalleryRoom /> : <MuseumGallery />;
}
