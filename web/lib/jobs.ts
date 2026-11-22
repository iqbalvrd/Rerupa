/**
 * Job polling for `generate_lesson`, checkpoint `feedback` and `generate_story` jobs.
 * `GET /jobs/{id}` every second for the first 10 s, then every 2 s, until
 * `is_final: true` (API.md, "Status job").
 */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api, isApiError } from "./api";
import type { Job } from "./schemas";

export const JOB_POLL_INTERVAL_MS = 1_000;
export const JOB_POLL_SLOW_INTERVAL_MS = 2_000;
const JOB_POLL_FAST_FOR_MS = 10_000;

/** Poll fast while a job is young, then back off (API.md). */
export function jobPollInterval(job: Pick<Job, "created_at" | "is_final"> | undefined, now = Date.now()): number | false {
  if (!job) return JOB_POLL_INTERVAL_MS;
  if (job.is_final) return false;
  const age = now - Date.parse(job.created_at);
  return Number.isFinite(age) && age > JOB_POLL_FAST_FOR_MS ? JOB_POLL_SLOW_INTERVAL_MS : JOB_POLL_INTERVAL_MS;
}

/** Screen text per `progress.step` (API.md). Unknown steps fall back to a neutral label. */
const STEP_LABELS: Record<string, string> = {
  queued: "Menunggu giliran",
  started: "Memulai",
  cv: "Menganalisis foto",
  planning: "Membagi tahapan",
  colors: "Menghitung campuran warna",
  writing: "Menulis instruksi",
  saving: "Menyimpan",
  done: "Selesai",
};

export function jobStepLabel(step: string | undefined): string {
  return (step && STEP_LABELS[step]) || "Memproses";
}

/** Ordered steps of a lesson job, for a step-by-step status list. */
export const LESSON_JOB_STEPS = ["cv", "planning", "colors", "writing", "saving"] as const;
/** Ordered steps of a checkpoint feedback job. */
export const FEEDBACK_JOB_STEPS = ["cv", "writing", "saving"] as const;

export const jobKeys = {
  detail: (id: string) => ["job", id] as const,
};

/**
 * Poll a job until it is final. Polling pauses while the tab is hidden and
 * resumes when it is visible again (TanStack Query default for
 * `refetchIntervalInBackground: false`), so a backgrounded phone does not keep
 * hitting the API.
 */
export function useJob(jobId: string | null | undefined) {
  return useQuery({
    queryKey: jobKeys.detail(jobId ?? "none"),
    queryFn: ({ signal }) => api.getJob(jobId!, signal),
    enabled: Boolean(jobId),
    refetchInterval: (query) => jobPollInterval(query.state.data),
    refetchIntervalInBackground: false,
    // A final job never changes; do not refetch it on focus or remount.
    staleTime: (query) => (query.state.data?.is_final ? Infinity : 0),
    retry: (failureCount, err) => {
      // Network blips and rate limits are worth retrying; a 404 is not.
      if (isApiError(err, "not_found") || isApiError(err, "session_required")) return false;
      return failureCount < 5;
    },
    retryDelay: (attempt, err) =>
      isApiError(err) && err.retryAfter ? err.retryAfter * 1_000 : Math.min(1_000 * 2 ** attempt, 8_000),
  });
}

export type JobOutcome = "pending" | "succeeded" | "needs_retake" | "failed";

/** Collapse a job into what the UI needs to decide its next screen. */
export function jobOutcome(job: Job | undefined): JobOutcome {
  if (!job || !job.is_final) return "pending";
  if (job.status === "succeeded") return "succeeded";
  if (job.status === "needs_retake") return "needs_retake";
  return "failed";
}
