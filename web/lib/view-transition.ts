/**
 * Gallery ↔ artwork transitions with the View Transitions API (same-document,
 * since the App Router swaps pages without a full load).
 *
 * The shared element is the whole frame (frame + artwork), so they move as
 * one. It is named `artwork-hero` on both sides only while a transition runs
 * on the gallery side; the artwork page's frame always carries the name.
 *
 * - Walk up (gallery → artwork): the frame flies to the artwork page while the
 *   room zooms toward it and dims.
 * - Walk back (artwork → gallery): the frame flies back to its place on the
 *   wall while the room zooms out from it and the lights come up.
 *
 * Browsers without the API and reduced-motion users just navigate.
 */
export const HERO_TRANSITION_NAME = "artwork-hero";

/**
 * Resolve once `check()` returns a value, or after `timeoutMs` (never blocks
 * navigation). Polls on a timer: while a view transition's update callback is
 * pending the browser suspends rendering, so requestAnimationFrame never fires.
 */
function waitFor<T>(check: () => T | null | undefined | false, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const found = check();
      if (found) return resolve(found);
      if (performance.now() - start > timeoutMs) return resolve(null);
      setTimeout(tick, 16);
    };
    tick();
  });
}

/**
 * Browsers abort a view transition whose DOM update takes too long (about 4 s).
 * Keep our wait well under that, and swallow the abort: the navigation itself
 * has already happened, only the animation is skipped.
 */
const UPDATE_BUDGET_MS = 2_500;

function startTransition(update: () => Promise<void>): ViewTransition {
  const transition = document.startViewTransition(() =>
    Promise.race([update(), new Promise<void>((resolve) => setTimeout(resolve, UPDATE_BUDGET_MS))]),
  );
  transition.ready.catch(() => {});
  transition.updateCallbackDone.catch(() => {});
  transition.finished.catch(() => {});
  return transition;
}

function canAnimate(): boolean {
  return Boolean(document.startViewTransition) && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setOrigin(el: Element) {
  const box = el.getBoundingClientRect();
  const root = document.documentElement;
  root.style.setProperty("--walk-origin-x", `${box.left + box.width / 2}px`);
  root.style.setProperty("--walk-origin-y", `${box.top + box.height / 2}px`);
}

/** Gallery → artwork. `frame` is the clicked frame in the gallery. */
export function navigateToArtwork(frame: HTMLElement | null, navigate: () => void): void {
  if (!frame || !canAnimate()) {
    navigate();
    return;
  }
  const root = document.documentElement;
  frame.style.viewTransitionName = HERO_TRANSITION_NAME;
  setOrigin(frame);
  root.dataset.transition = "walk-up";
  const transition = startTransition(async () => {
    // The old snapshot is taken; drop the gallery name so it never collides with the hero.
    frame.style.viewTransitionName = "";
    navigate();
    await waitFor(() => document.querySelector("[data-artwork-hero]"), 1_800);
  });
  transition.finished.finally(() => {
    frame.style.viewTransitionName = "";
    delete root.dataset.transition;
  });
}

/** Artwork → gallery: the frame returns to its place on the wall. */
export function navigateBackToGallery(slug: string, navigate: () => void): void {
  rememberArtwork(slug);
  const hero = document.querySelector<HTMLElement>("[data-artwork-hero]");
  if (!hero || !canAnimate()) {
    navigate();
    return;
  }
  const root = document.documentElement;
  root.dataset.transition = "walk-back";
  let target: HTMLElement | null = null;
  const transition = startTransition(async () => {
    navigate();
    // Wait until the artwork layer is gone and the gallery shows this artwork
    // (instant when the gallery stayed mounted underneath).
    target = await waitFor(() => {
      if (document.querySelector("[data-artwork-hero]")) return null;
      const el = document.querySelector<HTMLElement>(`[data-gallery-frame="${CSS.escape(slug)}"]`);
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return Math.abs(box.left + box.width / 2 - window.innerWidth / 2) < 40 ? el : null;
    }, 1_800);
    if (target) {
      target.style.viewTransitionName = HERO_TRANSITION_NAME;
      setOrigin(target);
    }
  });
  transition.finished.finally(() => {
    if (target) target.style.viewTransitionName = "";
    delete root.dataset.transition;
  });
}

/** Remember which artwork the user opened, so the gallery can reopen at it. */
const LAST_ARTWORK_KEY = "rerupa:last-artwork";

export function rememberArtwork(slug: string): void {
  try {
    sessionStorage.setItem(LAST_ARTWORK_KEY, slug);
  } catch {
    // storage unavailable: the gallery just opens at the first artwork
  }
}

export function lastArtwork(): string | null {
  try {
    return sessionStorage.getItem(LAST_ARTWORK_KEY);
  } catch {
    return null;
  }
}
