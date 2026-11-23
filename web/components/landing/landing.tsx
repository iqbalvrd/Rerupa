"use client";

import { Logo } from "@/components/brand/logo";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useProgress } from "@react-three/drei";
import { useQueryClient } from "@tanstack/react-query";
import { markGalleryEntrance, preloadGallery } from "@/lib/gallery-entrance";
import { useCallback, useEffect, useRef, useState } from "react";
import { GRASS, LOAD_TIMEOUT_MS, RENDERER, SEEN_KEY, TRAVEL } from "./landing-config";
import { createTravelState, type TravelState } from "./travel-state";
import styles from "./landing.module.css";


const LandingScene = dynamic(() => import("./landing-scene"), { ssr: false, loading: () => null });

const GALLERY = "/galeri";
const FALLBACK_IMAGE = "/landing/landing-fallback.webp";
const FALLBACK_PORTRAIT = "/landing/landing-fallback-portrait.webp";

type Mode = "pending" | "3d" | "static";

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}
function writeSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // ignore: only makes "Lewati" more prominent next time
  }
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Phones and weak devices get less grass and a pixel ratio of 1 (LANDING_SPEC §6). */
function deviceTier() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;
  const veryWeak = memory <= 2 || cores <= 2;
  const lowEnd = small || cores <= 4 || memory <= 4;
  return { veryWeak, lowEnd };
}

/**
 * Landing: museum front yard → tap → camera walks to the door, the doors open,
 * white light, then the gallery (LANDING_SPEC §3). All text lives in this HTML
 * overlay, never only in 3D. Without WebGL (or on very weak devices) a static
 * render of the first camera angle stands in (§9).
 */
export function Landing() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("pending");
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [seen, setSeen] = useState(false);
  const [settings, setSettings] = useState<{ grass: number; dpr: number }>({ grass: GRASS.count, dpr: RENDERER.maxDpr });
  // Mutable per-frame state shared with the scene; never triggers a render.
  const [travel] = useState<TravelState>(() => createTravelState(false));
  const whiteRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDialogElement>(null);
  const progress = useProgress((s) => s.progress);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    travel.reduceMotion = reduce;
    const { veryWeak, lowEnd } = deviceTier();
    setSettings({ grass: lowEnd ? GRASS.countLowEnd : GRASS.count, dpr: lowEnd ? 1 : RENDERER.maxDpr });
    setSeen(readSeen());
    setMode(hasWebGL() && !veryWeak ? "3d" : "static");
    router.prefetch(GALLERY);
  }, [router, travel]);

  // Never leave the enter button locked if an asset hangs.
  useEffect(() => {
    if (mode !== "3d") return;
    const id = window.setTimeout(() => setReady(true), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [mode]);

  const onLoaded = useCallback(() => setReady(true), []);

  // Once the museum itself has loaded, use the time in the front yard and on
  // the walk to the door to load the gallery's first view.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (mode === "static" || ready) preloadGallery(queryClient);
  }, [mode, ready, queryClient]);

  /** White fade, then the gallery. */
  const fadeToGallery = useCallback(
    (seconds: number) => {
      const white = whiteRef.current;
      if (white) {
        white.style.transition = `opacity ${seconds}s ease`;
        white.style.opacity = "1";
      }
      window.setTimeout(() => {
        markGalleryEntrance();
        router.push(GALLERY);
      }, seconds * 1000 + 30);
    },
    [router],
  );

  const enter = useCallback(() => {
    const t = travel;
    if (leaving || t.phase !== "idle") return;
    if (mode === "3d" && !ready) return;
    setLeaving(true);
    writeSeen();
    if (mode === "static" || t.reduceMotion) {
      t.phase = "done";
      fadeToGallery(t.reduceMotion ? 0.3 : TRAVEL.fadeOut);
      return;
    }
    t.t = 0;
    t.startedAt = performance.now();
    t.phase = "travel";
  }, [leaving, mode, ready, fadeToGallery, travel]);

  const skip = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    writeSeen();
    travel.phase = "done";
    fadeToGallery(TRAVEL.fadeOut);
  }, [leaving, fadeToGallery, travel]);

  const onArrive = useCallback(() => {
    travel.phase = "done";
    markGalleryEntrance();
    router.push(GALLERY);
  }, [router, travel]);

  const canEnter = mode === "static" || (mode === "3d" && ready);
  const loading = mode === "pending" || (mode === "3d" && !ready);

  return (
    <div className={styles.root}>
      {mode === "static" && (
        <picture>
          <source media="(max-aspect-ratio: 4/5)" srcSet={FALLBACK_PORTRAIT} />
          <img className={styles.fallback} src={FALLBACK_IMAGE} alt="Halaman depan Museum Nasional (Gedung Gajah) saat senja, dengan patung gajah di halaman" />
        </picture>
      )}
      {mode === "3d" && (
        <LandingScene
          travel={travel}
          grassCount={settings.grass}
          maxDpr={settings.dpr}
          whiteRef={whiteRef}
          onLoaded={onLoaded}
          onEnter={enter}
          onArrive={onArrive}
        />
      )}
      <div className={styles.vignette} aria-hidden="true" />

      <div className={styles.ui} data-hidden={leaving}>
        <header className={styles.title}>
          <p className={styles.tagline}>Mentor melukis seni Nusantara</p>
          <h1 className={styles.wordmark}>
            <Logo className={styles.logo} priority />
          </h1>
          <p className={styles.lead}>Masuk museum, kenali karyanya, lukis ulang langkah demi langkah.</p>
        </header>

        <nav className={styles.top} aria-label="Pilihan">
          <button type="button" className={styles.pill} onClick={() => aboutRef.current?.showModal()}>
            Tentang · Tim
          </button>
          <button type="button" className={`${styles.pill} ${seen ? styles.pillStrong : ""}`} onClick={skip}>
            {seen ? "Langsung ke galeri ›" : "Lewati"}
          </button>
        </nav>

        <footer className={styles.bar}>
          <span>BUDAYA GO 2026 · Inovasi Digital</span>
          <button type="button" className={styles.go} onClick={enter} disabled={!canEnter || leaving}>
            {canEnter ? "Ketuk untuk masuk ›" : "Memuat museum…"}
          </button>
        </footer>
      </div>

      {loading && (
        <div className={styles.loader} role="status" aria-live="polite">
          <div>
            <Logo className={styles.loaderLogo} />
            <p>Memuat halaman museum</p>
            <div className={styles.meter} aria-hidden="true">
              <i style={{ inlineSize: `${mode === "3d" ? Math.round(progress) : 0}%` }} />
            </div>
          </div>
        </div>
      )}

      <div ref={whiteRef} className={styles.white} aria-hidden="true" />

      <dialog ref={aboutRef} className={styles.dialog} aria-labelledby="about-title">
        <h2 id="about-title">Tentang Rerupa</h2>
        <p>
          Mentor melukis berbasis AI untuk mempelajari seni Nusantara melalui panduan visual, campuran warna, dan feedback progres.
        </p>
        <ul>
          <li>Lomba: BUDAYA GO 2026, Inovasi Digital</li>
          <li>Tim: Xavier, Iqbal, Sheva</li>
          <li>Pohon, semak, bunga: Stylized Nature MegaKit oleh Quaternius (CC0)</li>
        </ul>
        <form method="dialog">
          <button type="submit" className={`${styles.pill} ${styles.pillDark}`} autoFocus>
            Tutup
          </button>
        </form>
      </dialog>
    </div>
  );
}
