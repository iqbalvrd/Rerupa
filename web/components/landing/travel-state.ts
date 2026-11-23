/**
 * Mutable state shared by the scene parts every frame (no React re-renders).
 * `phase`: idle (title screen) → travel (camera walk) → done (white, routing).
 */
import { createContext, useContext } from "react";

export type TravelPhase = "idle" | "travel" | "done";

export type TravelState = {
  phase: TravelPhase;
  /** Travel progress 0–1. */
  t: number;
  /** performance.now() when the walk started. The walk is timed by the clock, not by frames, so a slow device skips frames instead of walking in slow motion. */
  startedAt: number;
  /** Pointer is over the door (brighter glow, pointer cursor). */
  hovering: boolean;
  /** Portrait layout (aspect < 0.8): statue and first look target move left. */
  portrait: boolean;
  /** No camera walk and no idle animation. */
  reduceMotion: boolean;
};

export function createTravelState(reduceMotion: boolean): TravelState {
  return { phase: "idle", t: 0, startedAt: 0, hovering: false, portrait: false, reduceMotion };
}

export const TravelContext = createContext<TravelState | null>(null);

export function useTravel(): TravelState {
  const s = useContext(TravelContext);
  if (!s) throw new Error("useTravel outside <TravelContext>");
  return s;
}
