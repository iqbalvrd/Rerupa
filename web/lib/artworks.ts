"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./api";
import { ArtworkCard } from "./schemas";

/** A gallery card. Fixtures also know the image size, which avoids layout shift. */
export const GalleryArtwork = ArtworkCard.extend({
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type GalleryArtwork = z.infer<typeof GalleryArtwork>;

/**
 * `fixtures`: dev-only data built from ../content/artworks by `npm run fixtures`,
 * for while the API has no published artworks. Anything else: the API.
 */
export const GALLERY_SOURCE: "api" | "fixtures" =
  process.env.NEXT_PUBLIC_GALLERY_SOURCE === "fixtures" ? "fixtures" : "api";

async function loadFixtures(signal: AbortSignal): Promise<GalleryArtwork[]> {
  const res = await fetch("/_dev/artworks.json", { signal });
  if (!res.ok) throw new Error("Data contoh belum dibuat. Jalankan `npm run fixtures`.");
  return z.array(GalleryArtwork).parse(await res.json());
}

export function useArtworks() {
  return useQuery({
    queryKey: ["artworks", GALLERY_SOURCE],
    queryFn: ({ signal }): Promise<GalleryArtwork[]> =>
      GALLERY_SOURCE === "fixtures" ? loadFixtures(signal) : api.listArtworks(signal),
  });
}

/** Museum label line under the title: artist (never guessed) or tradition, then region. */
export function artworkByline(a: Pick<ArtworkCard, "artist" | "tradition" | "region_origin">): string {
  const who = a.artist ?? a.tradition ?? "Seniman tidak diketahui";
  return a.region_origin ? `${who} · ${a.region_origin}` : who;
}

const LICENSE_LABELS: Record<string, string> = {
  public_domain: "Domain publik",
  cc0: "CC0",
  cc_by: "CC BY",
  cc_by_sa: "CC BY-SA",
  open_data: "Data terbuka",
  ebt_pending: "Status EBT menunggu konfirmasi",
  own_work: "Karya sendiri",
  permission_granted: "Dengan izin",
};

export function licenseLabel(license: string): string {
  return LICENSE_LABELS[license] ?? license;
}
