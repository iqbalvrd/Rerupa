/**
 * Pure helpers for the Selesai page (PRD FR14, F10; SYSTEM_ARCHITECTURE §selesai).
 * No React, no DOM.
 */
import type { Lesson, Progress, StageProgressStatus } from "./schemas";

export type StageSummary = {
  code: string;
  order: number;
  title: string;
  status: StageProgressStatus;
  isCheckpoint: boolean;
  /** Feedback actually received for this stage. A skipped checkpoint has 0 and must not read as checked. */
  feedbackCount: number;
};

export type FinishSummary = {
  stages: StageSummary[];
  completed: number;
  total: number;
  allDone: boolean;
  /** First stage that is not completed yet (to send the user back to), or null. */
  firstOpen: StageSummary | null;
};

export function summarize(lesson: Lesson, progress: Progress): FinishSummary {
  const byCode = new Map(progress.stages.map((s) => [s.code, s]));
  const stages = lesson.stages
    .toSorted((a, b) => a.order_no - b.order_no)
    .map((s): StageSummary => {
      const p = byCode.get(s.code);
      return {
        code: s.code,
        order: s.order_no,
        title: s.title,
        status: p?.status ?? "not_started",
        isCheckpoint: s.is_checkpoint,
        feedbackCount: p?.feedback_count ?? 0,
      };
    });
  const completed = stages.filter((s) => s.status === "completed").length;
  return {
    stages,
    completed,
    total: stages.length,
    allDone: stages.length > 0 && completed === stages.length,
    firstOpen: stages.find((s) => s.status !== "completed") ?? null,
  };
}

/** A reflection is usable only when its correct option points at a real option. */
export function isValidReflection(r: Lesson["reflection"]): r is NonNullable<Lesson["reflection"]> {
  return Boolean(r && r.options.length >= 2 && r.correct_option >= 0 && r.correct_option < r.options.length);
}
