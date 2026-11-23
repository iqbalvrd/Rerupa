"use client";

import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { z } from "zod";
import { ApiError, api, isApiError } from "./api";
import { DEV_LESSON_ID, DEV_MOCK_API } from "./dev-mock";
import { ArtworkCard, ArtworkDetail, CultureClaim } from "./schemas";

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
  const cards = z.array(GalleryArtwork).parse(await res.json());
  // With the dev API mock on, every sample artwork can be practised using the example lesson.
  return DEV_MOCK_API ? cards.map((c) => ({ ...c, lesson_version_id: DEV_LESSON_ID })) : cards;
}

/** Shared by the gallery and the landing's preload, so the walk to the door warms the cache. */
export function artworksQuery() {
  return queryOptions({
    queryKey: ["artworks", GALLERY_SOURCE],
    queryFn: ({ signal }): Promise<GalleryArtwork[]> =>
      GALLERY_SOURCE === "fixtures" ? loadFixtures(signal) : api.listArtworks(signal),
    // Thumbnail URLs are signed per request: a refetch would swap every image
    // on the wall. They live 30–60 minutes, so keep the list well inside that.
    staleTime: 5 * 60_000,
  });
}

export function useArtworks() {
  return useQuery(artworksQuery());
}

export const GalleryArtworkDetail = ArtworkDetail.extend({
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** Dev fixtures only: the team's claims from content/, shown before the lesson is imported. */
  claims: z.array(CultureClaim).optional(),
});
export type GalleryArtworkDetail = z.infer<typeof GalleryArtworkDetail>;

async function loadFixtureDetail(slug: string, signal: AbortSignal): Promise<GalleryArtworkDetail> {
  const res = await fetch(`/_dev/artworks/${encodeURIComponent(slug)}.json`, { signal });
  if (res.status === 404) throw new ApiError("not_found", "Karya tidak ditemukan.", { status: 404 });
  if (!res.ok) throw new Error("Data contoh belum dibuat. Jalankan `npm run fixtures`.");
  const detail = GalleryArtworkDetail.parse(await res.json());
  return DEV_MOCK_API ? { ...detail, lesson_version_id: DEV_LESSON_ID } : detail;
}

/** Shared by useArtwork and the gallery's prefetch, so a prefetched detail is a cache hit. */
export function artworkQuery(slug: string) {
  return queryOptions({
    queryKey: ["artwork", GALLERY_SOURCE, slug],
    queryFn: ({ signal }): Promise<GalleryArtworkDetail> =>
      GALLERY_SOURCE === "fixtures" ? loadFixtureDetail(slug, signal) : api.getArtwork(slug, signal),
    retry: (count, err) => !isApiError(err, "not_found") && count < 2,
    // Signed image URLs live 30–60 minutes; keep the detail fresh well inside that.
    staleTime: 10 * 60_000,
  });
}

export function useArtwork(slug: string, enabled = true) {
  return useQuery({ ...artworkQuery(slug), enabled: enabled && Boolean(slug) });
}

/**
 * Warm up an artwork page while its frame is on the wall: detail data and the
 * full image, so opening it is instant and the frame never waits for data.
 */
export function usePrefetchArtwork() {
  const queryClient = useQueryClient();
  return useCallback((slug: string) => {
    void queryClient.prefetchQuery(artworkQuery(slug)).then(() => {
      const detail = queryClient.getQueryData<GalleryArtworkDetail>(artworkQuery(slug).queryKey);
      const src = detail?.image_url ?? detail?.thumbnail_url;
      if (src) {
        const img = new Image();
        img.decoding = "async";
        img.src = src;
      }
    });
  }, [queryClient]);
}

/**
 * The published lesson behind a collection artwork: practice goal and the
 * culture claims (fact with sources vs AI estimate). Collection lessons need
 * no session. Signed layer URLs expire after 60 minutes, so refetch hourly.
 */
export function useCollectionLesson(lessonVersionId: string | null | undefined) {
  return useQuery({
    queryKey: ["lesson", lessonVersionId],
    queryFn: ({ signal }) => api.getLesson(lessonVersionId!, { signal }),
    enabled: Boolean(lessonVersionId),
    staleTime: 50 * 60_000,
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

/**
 * Painting used to illustrate "Cara kerja": a landscape with big, clear shapes
 * reads well even as a tiny sketch. Falls back to the first artwork.
 */
const HOWTO_SAMPLE_SLUGS = ["mas-pirngadie-sawah-berundak", "raden-saleh-perburuan-singa"];
export function howtoSample(list: readonly Pick<ArtworkCard, "slug" | "thumbnail_url">[] | undefined): string | undefined {
  if (!list?.length) return undefined;
  for (const slug of HOWTO_SAMPLE_SLUGS) {
    const hit = list.find((a) => a.slug === slug && a.thumbnail_url);
    if (hit?.thumbnail_url) return hit.thumbnail_url;
  }
  return list.find((a) => a.thumbnail_url)?.thumbnail_url ?? undefined;
}
