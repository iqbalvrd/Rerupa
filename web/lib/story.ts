/**
 * Storyline cerita (P1): "Kisah di balik karya" in 4–6 panels.
 * Contract: api/API.md "Storyline cerita". Hard rules (PRD, CLAUDERerupa.md):
 * `basis_label` always above the story, `image_label` on every panel with an
 * image, and a claim is shown as fact only with a source link.
 */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api, isApiError, newIdempotencyKey } from "./api";
import { StoryJobResult, type Job, type Story, type StoryClaim, type StoryPanel, type StorySource } from "./schemas";

/** How often an unfinished story is re-read while its panels are drawn. */
export const STORY_POLL_INTERVAL_MS = 1_500;

export const storyKeys = {
  detail: (id: string) => ["story", id] as const,
  collection: (lessonId: string) => ["story", "collection", lessonId] as const,
};

/** The server says this story cannot be offered: hide the entry point instead of showing an error. */
export function isStoryUnavailable(err: unknown): boolean {
  return isApiError(err, "feature_disabled") || isApiError(err, "story_not_available");
}

/**
 * The reviewed story of a collection lesson. Collection lessons answer 200
 * `{story_id}` straight away (no job, no session), or 404 when there is none.
 * Resolves to `null` when the story is unavailable, so callers simply hide
 * their button.
 */
export function useCollectionStory(lessonId: string | null | undefined) {
  return useQuery({
    queryKey: storyKeys.collection(lessonId ?? "none"),
    queryFn: async (): Promise<string | null> => {
      try {
        const out = await api.startStory(lessonId!, {}, newIdempotencyKey());
        return out.story_id ?? null;
      } catch (err) {
        if (isStoryUnavailable(err) || isApiError(err, "not_found")) return null;
        throw err;
      }
    },
    enabled: Boolean(lessonId),
    staleTime: 30 * 60_000,
    retry: 1,
  });
}

/** Still being made: the story itself, or any panel whose picture is not done. */
export function isStoryGenerating(story: Story | undefined): boolean {
  if (!story) return true;
  return story.status === "generating" || story.panels.some((p) => p.status === "pending");
}

/** Read a story; keeps polling while panels appear one by one. */
export function useStory(id: string | null | undefined) {
  return useQuery({
    queryKey: storyKeys.detail(id ?? "none"),
    queryFn: ({ signal }) => api.getStory(id!, signal),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data && !isStoryGenerating(query.state.data) ? false : STORY_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    // Signed panel URLs live 30–60 minutes; a finished story is re-read well inside that.
    staleTime: (query) => (query.state.data && !isStoryGenerating(query.state.data) ? 20 * 60_000 : 0),
    retry: (count, err) => !isApiError(err, "not_found") && !isStoryUnavailable(err) && count < 3,
  });
}

/** What one panel shows. */
export type PanelView = "image" | "pending" | "purged" | "text";

export function panelView(panel: StoryPanel): PanelView {
  if (panel.purged) return "purged";
  if (panel.status === "pending") return "pending";
  if (panel.kind === "text" || panel.status === "text_only" || !panel.image_url) return "text";
  return "image";
}

/**
 * The label every picture carries. The server sends it; if it ever does not,
 * derive it from the panel kind so no picture is shown unlabelled.
 */
export function panelImageLabel(panel: StoryPanel): string {
  if (panel.image_label) return panel.image_label;
  return panel.kind === "artwork_crop" ? "Potongan karya asli" : "Ilustrasi AI";
}

/** A claim counts as fact only when the server typed it so and it carries at least one source link. */
export function isSourcedFact(claim: StoryClaim): boolean {
  return claim.type === "fakta" && claim.source_urls.length > 0;
}

/** Title for a claim's source link: the matching entry in `sources`, else its domain. */
export function sourceTitle(url: string, sources: StorySource[]): string {
  const known = sources.find((s) => s.url === url);
  if (known) return known.title || known.domain;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Only http(s) links are rendered as links. */
export function isSafeUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** Whether the label is a sourced basis (green) or a weaker one (amber). */
export function basisIsSourced(basis: string): boolean {
  return basis === "curated" || basis === "sourced";
}

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "Keyakinan tinggi",
  medium: "Keyakinan sedang",
  low: "Keyakinan rendah",
};

/** Badge text for an identity the research agent found; null when the user gave it or it is unknown. */
export function identityConfidenceLabel(story: Story): string | null {
  if (story.identity.source !== "ai_research" || !story.identity.confidence) return null;
  return CONFIDENCE_LABELS[story.identity.confidence] ?? null;
}

/** "Judul · Seniman · Asal" from the story identity, skipping unknown parts. */
export function identityLine(story: Story): string {
  const { title, artist, origin } = story.identity;
  return [title, artist, origin].filter((x): x is string => Boolean(x && x.trim())).join(" · ");
}

/** Back target from `?kembali=`: same-origin paths only, never another site. */
export function safeBackHref(raw: string | null, fallback = "/galeri"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}

/** Any id: the API answers `feature_disabled` when stories are off, `not_found` otherwise. */
const PROBE_STORY_ID = "00000000-0000-4000-8000-000000000000";

/**
 * Whether the server offers stories at all, without starting anything: read a
 * story that cannot exist. `feature_disabled` → off; `not_found` → on.
 * Used where starting a story would create a job (free mode).
 */
export function useStoryFeature() {
  return useQuery({
    queryKey: ["story", "feature"],
    queryFn: async (): Promise<boolean> => {
      try {
        await api.getStory(PROBE_STORY_ID);
        return true;
      } catch (err) {
        if (isApiError(err, "feature_disabled")) return false;
        if (isApiError(err, "not_found")) return true;
        throw err;
      }
    },
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

/** Screen text per `progress.step` of a `generate_story` job (api/story/service.py). */
export function storyStepLabel(step: string | undefined): string {
  if (!step || step === "queued") return "Menunggu giliran";
  if (step === "started") return "Memulai";
  if (step === "sources") return "Mencari sumber tentang karyamu";
  if (step === "storyboard") return "Menyusun alur kisah";
  const panel = step.match(/^panel_(\d+)$/);
  if (panel) return `Melukis panel ${panel[1]}`;
  if (step === "done") return "Selesai";
  return "Memproses";
}

/** The story id a finished `generate_story` job points to, or null. */
export function storyIdFromJob(job: Job | undefined): string | null {
  if (!job?.is_final || job.status !== "succeeded") return null;
  const parsed = StoryJobResult.safeParse(job.result);
  return parsed.success && parsed.data.kind === "story" ? (parsed.data.story_id ?? null) : null;
}

// ── Remember a free-mode story per lesson, so Selesai can reopen it ──────────
// Starting again would also return the existing id, but would create a job when
// there is none; the stored id avoids that. Not a credential: the API checks the
// session cookie on every read.

type Remembered = { storyId?: string; jobId?: string };
const storageKey = (lessonId: string) => `rerupa:story:${lessonId}`;

export function rememberedStory(lessonId: string): Remembered {
  try {
    const raw = window.localStorage.getItem(storageKey(lessonId));
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (!v || typeof v !== "object") return {};
    const { storyId, jobId } = v as Record<string, unknown>;
    return {
      ...(typeof storyId === "string" ? { storyId } : {}),
      ...(typeof jobId === "string" ? { jobId } : {}),
    };
  } catch {
    return {};
  }
}

export function rememberStory(lessonId: string, value: Remembered | null): void {
  try {
    if (value) window.localStorage.setItem(storageKey(lessonId), JSON.stringify(value));
    else window.localStorage.removeItem(storageKey(lessonId));
  } catch {
    // ignore: the story still opens for this page view
  }
}

/** Trimmed hint, or null when left empty (the API treats null as "not given"). */
export function hint(value: string): string | null {
  const v = value.trim().replace(/\s+/g, " ");
  return v ? v : null;
}
