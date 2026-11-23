"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ChevronLeft, ChevronRight, Camera } from "lucide-react";
import { AccountMenu } from "@/components/auth/account-menu";
import { Logo } from "@/components/brand/logo";
import {
  GALLERY_SOURCE,
  artworkByline,
  licenseLabel,
  useArtworks,
  usePrefetchArtwork,
  type GalleryArtwork,
} from "@/lib/artworks";
import { clearGalleryEntrance, isGalleryEntrance } from "@/lib/gallery-entrance";
import { lastArtwork, navigateToArtwork, rememberArtwork } from "@/lib/view-transition";
import { DEFAULT_FRAME, type FrameStyleId } from "./frames";
import { FramedArt } from "./framed-art";
import styles from "./gallery.module.css";

// The 3D room loads after the page is interactive. Until it is ready, or when
// WebGL is unavailable, the CSS room (walls, pilasters, floor) stays visible.
const Room3D = dynamic(() => import("./room-3d"), { ssr: false, loading: () => null });

/** Longest the doorway's white light waits for the gallery before revealing it anyway. */
const ENTRANCE_MAX_HOLD_MS = 6000;

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

type Bay =
  | { kind: "artwork"; artwork: GalleryArtwork }
  | { kind: "upload" };

/**
 * Gallery room: one artwork per wall bay, walked through with native horizontal
 * scroll snapping (swipe, trackpad, keyboard), previous/next buttons and one
 * marker per bay. Navigation is finite, like a corridor: it starts at the first
 * artwork and ends at the empty "Foto lukisanmu" frame.
 */
export function MuseumGallery({ frameStyle = DEFAULT_FRAME }: { frameStyle?: FrameStyleId }) {
  const artworks = useArtworks();
  // Render the wall only once the collection has loaded (or failed). Inserting
  // artworks before an already snapped bay makes the browser keep that bay in
  // view, which would open the gallery at its last frame.
  const bays: Bay[] = useMemo(
    () =>
      artworks.isPending
        ? []
        : [...(artworks.data ?? []).map((artwork) => ({ kind: "artwork" as const, artwork })), { kind: "upload" }],
    [artworks.isPending, artworks.data],
  );

  const sceneRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [current, setCurrent] = useState(0);
  const [settled, setSettled] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const pendingTarget = useRef<number | null>(null);
  const lastSettled = useRef(0);
  const count = bays.length;
  // null until checked on the client; the entrance waits for the answer.
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [roomReady, setRoomReady] = useState(false);
  useEffect(() => setWebgl(supportsWebGL()), []);

  // Arriving through the landing's doorway: stay white (the light from the
  // door) until the room, the collection and the first painting are ready,
  // then reveal everything at once. The landing preloaded most of it.
  const [entrance, setEntrance] = useState<"hold" | "reveal" | null>(() => (isGalleryEntrance() ? "hold" : null));
  useEffect(() => clearGalleryEntrance(), []);
  const [firstArtReady, setFirstArtReady] = useState(false);
  useEffect(() => {
    if (entrance !== "hold" || artworks.isPending) return;
    const img = trackRef.current?.querySelector("img");
    if (!img) return setFirstArtReady(true);
    let live = true;
    img.decode().catch(() => {}).finally(() => live && setFirstArtReady(true));
    return () => void (live = false);
  }, [entrance, artworks.isPending, bays]);
  const viewReady = !artworks.isPending && firstArtReady && webgl !== null && (!webgl || roomReady);
  useEffect(() => {
    if (entrance !== "hold") return;
    if (viewReady) return setEntrance("reveal");
    // Never keep the visitor in the light: reveal whatever is there after a while.
    const id = window.setTimeout(() => setEntrance("reveal"), ENTRANCE_MAX_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [entrance, viewReady]);

  /** Index of the bay whose center is nearest the track's center. */
  const nearestBay = useCallback((): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const width = track.clientWidth || 1;
    return Math.max(0, Math.min(count - 1, Math.round(track.scrollLeft / width)));
  }, [count]);

  const scrollToBay = useCallback(
    (index: number) => {
      const track = trackRef.current;
      if (!track) return;
      const target = Math.max(0, Math.min(count - 1, index));
      pendingTarget.current = target;
      setCurrent(target);
      track.scrollTo({ left: target * track.clientWidth });
    },
    [count],
  );

  const step = (dir: -1 | 1) => scrollToBay((pendingTarget.current ?? nearestBay()) + dir);

  // Live marker updates while scrolling (one per frame), and settle handling.
  useEffect(() => {
    const track = trackRef.current;
    const scene = sceneRef.current;
    if (!track || !scene) return;

    const supportsTimeline = CSS.supports("animation-timeline: scroll()");
    let frame = 0;

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Floor walk fallback where scroll-driven animations are unsupported.
        if (!supportsTimeline) scene.style.setProperty("--walk-x", `${-track.scrollLeft}px`);
        if (pendingTarget.current === null) setCurrent(nearestBay());
      });
    };

    const onSettle = () => {
      const index = nearestBay();
      // A scrollend from an earlier scroll while a newer one is still on its way: ignore it.
      if (pendingTarget.current !== null && pendingTarget.current !== index) return;
      pendingTarget.current = null;
      setCurrent(index);
      setSettled(index);
      if (index !== lastSettled.current) {
        lastSettled.current = index;
        setAnnouncement(`Karya ${index + 1} dari ${count}`);
      }
    };

    let debounce: ReturnType<typeof setTimeout> | undefined;
    const supportsScrollEnd = "onscrollend" in window;
    const onScrollFallback = () => {
      clearTimeout(debounce);
      debounce = setTimeout(onSettle, 120);
    };

    track.addEventListener("scroll", onScroll, { passive: true });
    if (supportsScrollEnd) track.addEventListener("scrollend", onSettle);
    else track.addEventListener("scroll", onScrollFallback, { passive: true });

    // How far the floor texture slides over the whole walk.
    const resize = new ResizeObserver(() => {
      scene.style.setProperty("--walk-distance", `${track.scrollWidth - track.clientWidth}px`);
    });
    resize.observe(track);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(debounce);
      resize.disconnect();
      track.removeEventListener("scroll", onScroll);
      track.removeEventListener("scrollend", onSettle);
      track.removeEventListener("scroll", onScrollFallback);
    };
  }, [count, nearestBay]);

  // Warm up the artwork in front of the visitor (and its neighbours): detail
  // data, full image and route, so tapping a frame opens it without waiting.
  const prefetchArtwork = usePrefetchArtwork();
  const router = useRouter();
  useEffect(() => {
    for (const i of [settled, settled + 1, settled - 1]) {
      const bay = bays[i];
      if (bay?.kind !== "artwork") continue;
      prefetchArtwork(bay.artwork.slug);
      router.prefetch(`/karya/${bay.artwork.slug}`);
    }
  }, [settled, bays, prefetchArtwork, router]);

  // Finite navigation: when an end button becomes disabled while focused, move focus to the other one.
  const atStart = settled === 0;
  const atEnd = settled === count - 1;
  useEffect(() => {
    if (atStart && document.activeElement === prevRef.current) nextRef.current?.focus();
    if (atEnd && document.activeElement === nextRef.current) prevRef.current?.focus();
  }, [atStart, atEnd]);

  const frame = frameStyle;

  // Coming back from an artwork page: reopen the wall at that artwork, without animating.
  const restored = useRef(false);
  useEffect(() => {
    const track = trackRef.current;
    if (restored.current || !track || count === 0) return;
    restored.current = true;
    const slug = lastArtwork();
    const index = slug ? bays.findIndex((b) => b.kind === "artwork" && b.artwork.slug === slug) : -1;
    if (index > 0) {
      track.scrollTo({ left: index * track.clientWidth, behavior: "instant" });
      lastSettled.current = index;
      setCurrent(index);
      setSettled(index);
    }
  }, [bays, count]);

  return (
    <div
      ref={sceneRef}
      className={styles.scene}
      data-room={roomReady ? "3d" : "css"}
      data-entrance={entrance ?? undefined}
    >
      {entrance && (
        <div
          className={styles.enterWhite}
          aria-hidden="true"
          onTransitionEnd={(e) => e.target === e.currentTarget && setEntrance(null)}
        >
          <span className={styles.enterNote}>Menyiapkan ruang galeri…</span>
        </div>
      )}
      <div className={styles.ceiling} aria-hidden="true" />
      <div className={styles.floorClip} aria-hidden="true">
        <div className={styles.floor} />
      </div>
      {webgl && count > 0 && (
        <div className={styles.room3d}>
          <Room3D trackRef={trackRef} bayCount={count} onReady={() => setRoomReady(true)} />
        </div>
      )}

      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          <Logo className="h-7 w-auto" priority />
        </Link>
        <div className={styles.topbarEnd}>
          <span className={styles.roomLabel}>Ruang Galeri</span>
          <AccountMenu />
        </div>
      </header>

      <section aria-roledescription="carousel" aria-label="Galeri karya">
        <div
          ref={trackRef}
          className={styles.track}
          tabIndex={0}
          role="group"
          aria-label="Dinding galeri. Geser ke kiri atau kanan untuk melihat karya lain."
        >
          {bays.map((bay, i) => (
            <div
              key={bay.kind === "artwork" ? bay.artwork.id : "upload"}
              className={styles.bay}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} dari ${count}`}
            >
              <span className={`${styles.pilaster} ${styles.pilasterStart}`} aria-hidden="true" />
              <span className={`${styles.pilaster} ${styles.pilasterEnd}`} aria-hidden="true" />
              {bay.kind === "artwork" ? (
                <ArtworkExhibit artwork={bay.artwork} frame={frame} eager={i === 0} />
              ) : (
                <UploadExhibit frame={frame} />
              )}
            </div>
          ))}
        </div>

        <p className={styles.visuallyHidden} role="status" aria-live="polite">
          {announcement}
        </p>

        <div className={styles.controls}>
          {GALLERY_SOURCE === "fixtures" && <span className={styles.fixtureBadge}>Data contoh (dev), belum terbit</span>}
          {artworks.isPending && (
            <p className={styles.notice} role="status">
              Menyiapkan ruang galeri…
            </p>
          )}
          {artworks.isError && (
            <p className={styles.notice} role="alert">
              Koleksi belum bisa dimuat. {artworks.error.message}{" "}
              <button type="button" className="underline" onClick={() => artworks.refetch()}>
                Coba lagi
              </button>
            </p>
          )}
          {artworks.isSuccess && artworks.data.length === 0 && (
            <p className={styles.notice}>Koleksi sedang disiapkan. Kamu tetap bisa berlatih dari foto lukisanmu.</p>
          )}
          {count > 1 && (
            <div className={styles.navRow}>
              <button
                ref={prevRef}
                type="button"
                className={styles.navButton}
                onClick={() => step(-1)}
                disabled={atStart}
                aria-label="Karya sebelumnya"
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <nav className={styles.markers} aria-label="Pilih karya">
                {bays.map((bay, i) => (
                  <button
                    key={i}
                    type="button"
                    className={styles.marker}
                    aria-current={i === current ? "true" : undefined}
                    aria-label={bay.kind === "artwork" ? `Ke karya ${i + 1}: ${bay.artwork.title}` : "Ke bingkai Foto lukisanmu"}
                    onClick={() => scrollToBay(i)}
                  />
                ))}
              </nav>
              <button
                ref={nextRef}
                type="button"
                className={styles.navButton}
                onClick={() => step(1)}
                disabled={atEnd}
                aria-label="Karya berikutnya"
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

type FrameProps = { frame: FrameStyleId };

function ArtworkExhibit({ artwork, frame, eager }: FrameProps & { artwork: GalleryArtwork; eager: boolean }) {
  const router = useRouter();
  const frameRef = useRef<HTMLSpanElement>(null);
  const href = `/karya/${artwork.slug}`;

  // Plain link without JS or with modifier keys; otherwise "walk up to the painting".
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    rememberArtwork(artwork.slug);
    navigateToArtwork(frameRef.current, () => router.push(href));
  };

  return (
    <Link href={href} className={styles.exhibit} onClick={onClick}>
      {artwork.thumbnail_url ? (
        <FramedArt
          frame={frame}
          src={artwork.thumbnail_url}
          alt={`${artwork.title}, ${artworkByline(artwork)}`}
          width={artwork.width}
          height={artwork.height}
          priority={eager}
          frameRef={frameRef}
          gallerySlug={artwork.slug}
        />
      ) : (
        <FramedArt frame={frame}>
          <span className={styles.emptyCanvas}>
            <span>Gambar belum tersedia</span>
          </span>
        </FramedArt>
      )}
      <span className={styles.plaque}>
        <span className={styles.plaqueTitle}>{artwork.title}</span>
        <br />
        <span className={styles.plaqueMeta}>{artworkByline(artwork)}</span>
        <br />
        <span className={styles.plaqueMeta}>{licenseLabel(artwork.license)}</span>
      </span>
    </Link>
  );
}

function UploadExhibit({ frame }: FrameProps) {
  return (
    <Link href="/unggah" className={styles.exhibit}>
      <FramedArt frame={frame}>
        <span className={styles.emptyCanvas}>
          <Camera aria-hidden="true" className="mx-auto" />
          <strong>Foto lukisanmu</strong>
          <span>Unggah foto karya, lalu ikuti tahapannya.</span>
        </span>
      </FramedArt>
      <span className={styles.plaque}>
        <span className={styles.plaqueTitle}>Bingkai untukmu</span>
        <br />
        <span className={styles.plaqueMeta}>Mode bebas · foto dari HP atau galeri</span>
      </span>
    </Link>
  );
}
