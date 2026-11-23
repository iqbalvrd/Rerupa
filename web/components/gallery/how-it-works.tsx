"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { Brush, CircleHelp, ImageUp, Layers, X } from "lucide-react";
import styles from "./how-it-works.module.css";

const SEEN_KEY = "rerupa:howto-seen";

const STEPS = [
  {
    title: "Pilih karya",
    body: "Pilih lukisan di galeri ini, atau unggah foto karya yang kamu suka.",
  },
  {
    title: "Dipecah jadi tahapan",
    body: "AI menyusun sketsa, bidang warna, lalu detail, lengkap dengan resep campuran cat.",
  },
  {
    title: "Lukis di kanvasmu",
    body: "Ikuti tiap tahap, lalu cek progresmu lewat foto.",
  },
] as const;

/**
 * What each step looks like, drawn from one real painting from the collection
 * (`sample`): the framed original, the same painting split into its stages
 * (sketch, color blocks, detail), and a canvas half painted over its sketch.
 * Without a sample the steps fall back to drawn icons.
 */
function StepVisual({ step, sample }: { step: number; sample?: string }) {
  if (!sample) {
    const Icon = [ImageUp, Layers, Brush][step];
    return (
      <span className={styles.medallion} aria-hidden="true">
        <Icon className="size-5" />
      </span>
    );
  }
  if (step === 0) {
    return (
      <span className={styles.visual} aria-hidden="true">
        <span className={styles.framed}>
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative, signed URL */}
          <img src={sample} alt="" />
        </span>
      </span>
    );
  }
  if (step === 1) {
    return (
      <span className={styles.visual} aria-hidden="true">
        <span className={styles.stack}>
          {(["sketch", "blocks", "detail"] as const).map((stage) => (
            <span key={stage} className={styles.sheet} data-stage={stage}>
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative, signed URL */}
              <img src={sample} alt="" />
            </span>
          ))}
        </span>
      </span>
    );
  }
  return (
    <span className={styles.visual} aria-hidden="true">
      <span className={styles.canvas}>
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative, signed URL */}
        <img src={sample} alt="" data-stage="sketch" />
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative, signed URL */}
        <img src={sample} alt="" data-stage="painted" />
        <span className={styles.grid} />
      </span>
    </span>
  );
}

function hasSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // ignore: the card may show again next visit
  }
}

/** Whether `display` can transition to none (exit animation); Firefox parses it but does not. */
let displayTransition: boolean | undefined;
function canAnimateExit(): boolean {
  if (displayTransition !== undefined) return displayTransition;
  if (!CSS.supports("overlay", "auto") || !CSS.supports("transition-behavior", "allow-discrete")) {
    return (displayTransition = false);
  }
  const probe = document.createElement("div");
  probe.style.cssText = "transition: display 1s allow-discrete !important; display: block;";
  document.body.appendChild(probe);
  void getComputedStyle(probe).display;
  probe.style.display = "none";
  displayTransition = getComputedStyle(probe).display === "block";
  probe.remove();
  return displayTransition;
}

/**
 * "Cara kerja": what a first-time visitor picks, what the AI makes of it and
 * what they do with it, readable in about ten seconds and shown on a real
 * painting from the collection (`sample`). Opens once on the first visit to
 * the gallery (after the room is revealed), and again from the header button.
 */
export function HowItWorks({ autoOpen, sample }: { autoOpen: boolean; sample?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const open = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    // React's autoFocus doesn't render the attribute, so showModal() would focus "Tutup".
    primaryRef.current?.focus();
  }, []);

  const close = useCallback(async () => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    if (!canAnimateExit()) {
      // Play the exit transition while still in the top layer, then close.
      dialog.setAttribute("data-closing", "");
      const running = dialog.getAnimations({ subtree: true });
      if (running.length) {
        await Promise.race([
          Promise.allSettled(running.map((a) => a.finished)),
          new Promise((r) => setTimeout(r, 400)),
        ]);
      }
      if (!dialog.hasAttribute("data-closing")) return;
      dialog.removeAttribute("data-closing");
    }
    dialog.close();
  }, []);

  // First visit: open once the gallery is on screen.
  useEffect(() => {
    if (!autoOpen || hasSeen()) return;
    const id = window.setTimeout(open, 450);
    return () => window.clearTimeout(id);
  }, [autoOpen, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => markSeen();
    // Esc / back gesture / light dismiss: route through the animated close.
    const onCancel = (e: Event) => {
      e.preventDefault();
      void close();
    };
    dialog.addEventListener("close", onClose);
    dialog.addEventListener("cancel", onCancel);

    // Light dismiss where `closedby` is unsupported (Safari): press and release outside the card.
    let pressedOutside = false;
    const outside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    const onDown = (e: PointerEvent) => void (pressedOutside = outside(e));
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && outside(e)) void close();
    };
    const fallback = !("closedBy" in HTMLDialogElement.prototype);
    if (fallback) {
      dialog.addEventListener("pointerdown", onDown);
      dialog.addEventListener("pointerup", onUp);
    }
    return () => {
      dialog.removeEventListener("close", onClose);
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointerup", onUp);
    };
  }, [close]);

  return (
    <>
      <button type="button" className={styles.trigger} onClick={open}>
        <CircleHelp aria-hidden="true" className="size-4" />
        Cara kerja
      </button>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="howto-title"
        {...({ closedby: "any" } as object)}
      >
        <div className={styles.kawung} aria-hidden="true" />
        <button type="button" className={styles.close} onClick={() => void close()}>
          <X aria-hidden="true" className="size-5" />
          <span className="sr-only">Tutup</span>
        </button>

        <div className={styles.body}>
          <h2 id="howto-title" className={styles.title}>
            Dari satu lukisan, jadi latihan bertahap
          </h2>

          <ol className={styles.steps}>
            {STEPS.map(({ title, body }, i) => (
              <li key={title} className={styles.step}>
                <StepVisual step={i} sample={sample} />
                <span className={styles.stepText}>
                  <span className={styles.stepTitle}>
                    <span className={styles.stepNo} aria-hidden="true">
                      {i + 1}
                    </span>
                    {title}
                  </span>
                  <span className={styles.stepBody}>{body}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className={styles.tumpal} aria-hidden="true" />

          <div className={styles.actions}>
            <button ref={primaryRef} type="button" className={styles.primary} onClick={() => void close()}>
              Pilih lukisan
            </button>
            <Link href="/unggah" className={styles.secondary}>
              Atau unggah foto karya
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}
