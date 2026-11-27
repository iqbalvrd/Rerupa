"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { AccountMenu } from "@/components/auth/account-menu";
import { Logo } from "@/components/brand/logo";
import { HowItWorks } from "../how-it-works";
import { GALLERY_SOURCE, artworkByline, howtoSample, licenseLabel, useArtworks, usePrefetchArtwork, type GalleryArtwork } from "@/lib/artworks";
import { clearGalleryEntrance, isGalleryEntrance } from "@/lib/gallery-entrance";
import { lastArtwork, navigateToArtwork, rememberArtwork, takeGalleryReturn } from "@/lib/view-transition";
import { adjacentGalleryIndex, galleryNavigationOrder, planRoom } from "./plan";
import type { Exhibit, RoomControl, RoomTarget } from "./room-scene";
import styles from "./gallery-room.module.css";

const RoomScene = dynamic(() => import("./room-scene"), { ssr: false, loading: () => null });

/** Longest the doorway's white light waits for the room before lifting anyway. */
const ENTRANCE_MAX_HOLD_MS = 7000;

type Mode = "overview" | "single";
type Item = { exhibit: Exhibit; artwork: GalleryArtwork | null };

/** Guided visits to paintings on the back, left and right walls of the hall. */
export function GalleryRoom() {
  const artworks = useArtworks();
  const items: Item[] = useMemo(() => {
    if (artworks.isPending) return [];
    const list: Item[] = (artworks.data ?? []).flatMap((a) =>
      a.thumbnail_url ? [{ exhibit: { key: a.id, kind: "artwork" as const, src: a.thumbnail_url, title: a.title }, artwork: a }] : [],
    );
    list.push({ exhibit: { key: "upload", kind: "upload", title: "Foto lukisanmu" }, artwork: null });
    return list;
  }, [artworks.isPending, artworks.data]);
  const exhibits = useMemo(() => items.map((i) => i.exhibit), [items]);
  // The arcade's shape follows the screen (wide on a laptop, tall on an upright phone).
  const [aspect, setAspect] = useState(16 / 9);
  useEffect(() => {
    const fit = () => setAspect(window.innerWidth / Math.max(1, window.innerHeight));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const plan = useMemo(() => planRoom(items.length, aspect), [items.length, aspect]);
  const count = items.length;
  const navigationOrder = useMemo(() => items.length ? galleryNavigationOrder(plan) : [], [plan, items.length]);

  // Arriving through the landing's doorway: stay white until the room and
  // every painting have loaded, then lift the light and walk in.
  const [entrance, setEntrance] = useState<"hold" | "reveal" | null>(() => (isGalleryEntrance() ? "hold" : null));
  useEffect(() => clearGalleryEntrance(), []);
  const [roomReady, setRoomReady] = useState(false);

  const returning = useRef(takeGalleryReturn());
  const pathname = usePathname();
  useEffect(() => {
    // The artwork opened as an overlay on the still-mounted room: drop the flag on the way back.
    if (pathname === "/galeri") takeGalleryReturn();
  }, [pathname]);

  const control = useRef<RoomControl>({
    target: { kind: "overview" },
    serial: 0,
    instant: entrance === null,
    fromDoorway: entrance !== null,
    hold: entrance !== null,
  });
  const anchors = useRef<(HTMLAnchorElement | null)[]>([]);
  const [mode, setMode] = useState<Mode>("overview");
  const [current, setCurrent] = useState(0);
  const navigationPosition = navigationOrder.indexOf(current);
  const [walking, setWalking] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  // Coming back from an artwork page: stand in front of it again.
  useLayoutEffect(() => {
    if (!returning.current || count === 0) return;
    returning.current = false;
    const slug = lastArtwork();
    const index = slug ? items.findIndex((i) => i.artwork?.slug === slug) : -1;
    if (index < 0) return;
    Object.assign(control.current, { target: { kind: "slot", index }, instant: true, fromDoorway: false, hold: false });
    control.current.serial++;
    setMode("single");
    setCurrent(index);
  }, [count, items]);

  useEffect(() => {
    if (entrance !== "hold") return;
    if (roomReady) {
      setEntrance("reveal");
      control.current.hold = false;
      control.current.invalidate?.();
      return;
    }
    const id = window.setTimeout(() => {
      setEntrance("reveal");
      control.current.hold = false;
      control.current.invalidate?.();
    }, ENTRANCE_MAX_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [entrance, roomReady]);

  const nameOf = useCallback((i: number) => items[i]?.exhibit.title ?? "", [items]);

  /** Walk to a painting, or back to the doorway. */
  const go = useCallback((target: RoomTarget) => {
    const ctl = control.current;
    ctl.target = target;
    ctl.serial++;
    setWalking(true);
    if (target.kind === "slot") setCurrent(target.index);
    ctl.invalidate?.();
  }, []);

  useEffect(() => {
    control.current.onArrive = (target) => {
      setWalking(false);
      if (target.kind === "slot") {
        setMode("single");
        setCurrent(target.index);
        setAnnouncement(`Di depan ${nameOf(target.index)}, karya ${navigationOrder.indexOf(target.index) + 1} dari ${count}`);
      } else {
        setMode("overview");
        setAnnouncement("Kembali ke pintu masuk. Pilih dinding atau lukisan untuk mendekat.");
      }
    };
  }, [count, nameOf, navigationOrder]);

  const step = useCallback((direction: -1 | 1) => {
    const target = control.current.target;
    if (target.kind === "overview") {
      const wall = direction < 0 ? "left" : "right";
      const index = navigationOrder.find(i => plan.slots[i].wall === wall);
      if (index !== undefined) go({ kind: "slot", index });
      return;
    }
    const next = adjacentGalleryIndex(navigationOrder, target.index, direction);
    if (next !== target.index) go({ kind: "slot", index: next });
  }, [navigationOrder, plan, go]);

  // Keyboard: arrows walk along the walls, Esc goes back to the doorway (not while an artwork is open on top).
  useEffect(() => {
    if (pathname !== "/galeri") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
      // Esc in an open dialog (Cara kerja, account) only closes that dialog.
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape" && mode === "single") go({ kind: "overview" });
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        step(e.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, mode, go, step]);

  // Warm up the artwork in front of the visitor and its neighbours.
  const prefetchArtwork = usePrefetchArtwork();
  const router = useRouter();
  useEffect(() => {
    if (mode !== "single") return;
    for (const i of [current, adjacentGalleryIndex(navigationOrder, current, 1), adjacentGalleryIndex(navigationOrder, current, -1)]) {
      const a = items[i]?.artwork;
      if (!a) continue;
      prefetchArtwork(a.slug);
      router.prefetch(`/karya/${a.slug}`);
    }
  }, [mode, current, items, navigationOrder, prefetchArtwork, router]);

  // In front of a painting, a horizontal swipe walks to the next one. There is no looking around:
  // the camera turns to face the destination wall.
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    suppressClick.current = false;
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || d.moved) return;
    const dx = Math.abs(e.clientX - d.x);
    const dy = Math.abs(e.clientY - d.y);
    if (dy > 10 && dy > dx) {
      drag.current = null;
      return;
    }
    if (dx > 10 && dx > dy) {
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !d.moved) return;
    suppressClick.current = true;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
  };
  const onClickCapture = (e: MouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  /** A painting's link: walk up to it, or open it when already in front of it. */
  const onExhibitClick = (i: number) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (mode !== "single" || i !== current || walking) {
      e.preventDefault();
      go({ kind: "slot", index: i });
      return;
    }
    const artwork = items[i].artwork;
    if (!artwork) return; // upload frame: plain link to /unggah
    e.preventDefault();
    rememberArtwork(artwork.slug);
    navigateToArtwork(e.currentTarget, () => router.push(`/karya/${artwork.slug}`));
  };

  const here = mode === "single" ? items[current] : undefined;

  return (
    <div className={styles.scene} data-entrance={entrance ?? undefined} data-mode={mode}>
      {entrance && (
        <div className={styles.enterWhite} aria-hidden="true" onTransitionEnd={(e) => e.target === e.currentTarget && setEntrance(null)}>
          <span className={styles.enterNote}>Menyiapkan ruang galeri…</span>
        </div>
      )}

      {count > 0 && (
        <div className={styles.canvas}>
          <RoomScene plan={plan} exhibits={exhibits} control={control} anchors={anchors} onReady={() => setRoomReady(true)} />
        </div>
      )}

      <div
        className={styles.hits}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onLostPointerCapture={() => (drag.current = null)}
        onClickCapture={onClickCapture}
      >
        <nav aria-label="Karya di ruang galeri">
          {items.map((item, i) => {
            const a = item.artwork;
            const isHere = mode === "single" && i === current && !walking;
            const label = isHere ? (a ? `Buka ${item.exhibit.title}` : "Unggah foto lukisanmu") : `Dekati ${item.exhibit.title}`;
            return (
              <Link
                key={item.exhibit.key}
                ref={(el) => void (anchors.current[i] = el)}
                href={a ? `/karya/${a.slug}` : "/unggah"}
                className={styles.hit}
                aria-label={label}
                aria-current={isHere ? "true" : undefined}
                data-gallery-frame={a?.slug}
                data-here={isHere ? "" : undefined}
                onClick={onExhibitClick(i)}
                draggable={false}
              >
                {item.exhibit.kind === "artwork" && (
                  // Shown only while a view transition runs, so the painting itself flies to the artwork page.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.exhibit.src} alt="" draggable={false} />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          <Logo className="h-7 w-auto" priority />
        </Link>
        <div className={styles.topbarEnd}>
          <span className={styles.roomLabel}>Ruang Galeri</span>
          {/* Opens once on the first visit, after the doorway light has faded. */}
          <HowItWorks autoOpen={entrance === null && !artworks.isPending} sample={howtoSample(artworks.data)} />
          <AccountMenu />
        </div>
      </header>

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

        {mode === "overview" && count > 0 && !walking && (
          <nav className={styles.actions} aria-label="Pilih dinding galeri">
            {([["left", "Dinding kiri"], ["back", "Dinding depan"], ["right", "Dinding kanan"]] as const).map(([wall, label]) => {
              const slot = navigationOrder.map(i => plan.slots[i]).find(s => s.wall === wall);
              return slot ? <button key={wall} className={styles.pill} onClick={() => go({ kind: "slot", index: slot.index })}>{label}</button> : null;
            })}
          </nav>
        )}

        {here && (
          <div className={styles.panel} data-walking={walking ? "" : undefined}>
            <div className={styles.plaque}>
              <span className={styles.plaqueTitle}>{here.exhibit.title}</span>
              {here.artwork ? (
                <span className={styles.plaqueMeta}>
                  {artworkByline(here.artwork)} · {licenseLabel(here.artwork.license)}
                </span>
              ) : (
                <span className={styles.plaqueMeta}>Mode bebas · foto dari HP atau galeri</span>
              )}
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.pill} onClick={() => go({ kind: "overview" })}>
                <LayoutGrid aria-hidden="true" />
                Lihat semua
              </button>
              {here.artwork ? (
                <Link
                  href={`/karya/${here.artwork.slug}`}
                  className={`${styles.pill} ${styles.primary}`}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    anchors.current[current]?.click();
                  }}
                >
                  Pelajari karya ini
                </Link>
              ) : (
                <Link href="/unggah" className={`${styles.pill} ${styles.primary}`}>
                  Unggah foto
                </Link>
              )}
            </div>
          </div>
        )}

        {mode === "single" && count > 1 && (
          <div className={styles.navRow}>
            <button type="button" className={styles.navButton} onClick={() => step(-1)} disabled={navigationPosition <= 0} aria-label="Karya sebelumnya">
              <ChevronLeft aria-hidden="true" />
            </button>
            <nav className={styles.markers} aria-label="Pilih karya">
              {navigationOrder.map((i, position) => (
                <button
                  key={items[i].exhibit.key}
                  type="button"
                  className={styles.marker}
                  aria-current={i === current ? "true" : undefined}
                  aria-label={items[i].artwork ? `Ke karya ${position + 1}: ${items[i].exhibit.title}` : "Ke bingkai Foto lukisanmu"}
                  onClick={() => i !== current && go({ kind: "slot", index: i })}
                />
              ))}
            </nav>
            <button
              type="button"
              className={styles.navButton}
              onClick={() => step(1)}
              disabled={navigationPosition === navigationOrder.length - 1}
              aria-label="Karya berikutnya"
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
