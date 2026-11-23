"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { Brush, CircleHelp, ImageUp, Layers, X } from "lucide-react";
import styles from "./how-it-works.module.css";

const SEEN_KEY = "rerupa:howto-seen";

const STEPS = [
  {
    icon: ImageUp,
    title: "Pilih atau foto karya",
    body: "Pilih lukisan di galeri ini, atau unggah foto karya yang kamu suka.",
  },
  {
    icon: Layers,
    title: "AI memecahnya jadi tahapan",
    body: "Sketsa, bidang warna, lalu detail, lengkap dengan resep campuran cat.",
  },
  {
    icon: Brush,
    title: "Lukis langkah demi langkah",
    body: "Ikuti tiap tahap di kanvasmu, cek foto progres, dan kenali kisah di balik karyanya.",
  },
] as const;

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
 * "Cara kerja": what a first-time visitor uploads, what the AI makes of it and
 * what they get, readable in about ten seconds. Opens once on the first visit
 * to the gallery (after the room is revealed), and again from the header button.
 */
export function HowItWorks({ autoOpen }: { autoOpen: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const open = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
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
        aria-describedby="howto-lead"
        {...({ closedby: "any" } as object)}
      >
        <div className={styles.kawung} aria-hidden="true" />
        <button type="button" className={styles.close} onClick={() => void close()}>
          <X aria-hidden="true" className="size-5" />
          <span className="sr-only">Tutup</span>
        </button>

        <div className={styles.body}>
          <p className={styles.kicker}>Selamat datang di museum</p>
          <h2 id="howto-title" className={styles.title}>
            Cara kerja Rerupa
          </h2>
          <p id="howto-lead" className={styles.lead}>
            Dari satu karya jadi latihan melukis bertahap.
          </p>

          <ol className={styles.steps}>
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className={styles.step}>
                <span className={styles.medallion} aria-hidden="true">
                  <Icon className="size-5" />
                  <span className={styles.stepNo}>{i + 1}</span>
                </span>
                <span className={styles.stepText}>
                  <span className={styles.stepTitle}>{title}</span>
                  <span className={styles.stepBody}>{body}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className={styles.tumpal} aria-hidden="true" />

          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => void close()} autoFocus>
              Mulai menjelajah
            </button>
            <Link href="/unggah" className={styles.secondary}>
              Atau foto lukisanmu
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}
