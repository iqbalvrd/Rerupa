"use client";

import type { QueryClient } from "@tanstack/react-query";
import { artworksQuery } from "./artworks";

/**
 * Hand-off from the landing's doorway to the gallery.
 *
 * The landing walks the visitor to the door for several seconds; that time is
 * used to load everything the gallery's first view needs (the collection, every
 * painting in the room, the 3D room's code and floor texture). The gallery then
 * stays white until it is ready and reveals itself in one piece.
 *
 * The flag is module state, not storage: it survives the client-side
 * navigation and is false on a fresh page load, on the server and the client
 * alike, so there is no hydration mismatch.
 */
let entering = false;

export function markGalleryEntrance() {
  entering = true;
}
export function isGalleryEntrance() {
  return entering;
}
export function clearGalleryEntrance() {
  entering = false;
}

const warmed = new Set<string>();
function warmImage(src: string) {
  if (warmed.has(src)) return;
  warmed.add(src);
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  void img.decode().catch(() => warmed.delete(src));
}

let started = false;
/** Start loading the gallery's first view. Safe to call more than once. */
export function preloadGallery(queryClient: QueryClient) {
  if (started) return;
  started = true;
  void import("@/components/gallery/room/room-scene");
  warmImage("/gallery/floor-wood.webp");
  void queryClient
    .fetchQuery(artworksQuery())
    .then((list) => {
      // The gallery opens on the overview wall, so every painting is in view.
      for (const artwork of list) if (artwork.thumbnail_url) warmImage(artwork.thumbnail_url);
    })
    .catch(() => {
      started = false; // the gallery shows its own error and retry
    });
}
