/**
 * Dev-only mock of the storyline API (P1), used by lib/dev-mock.ts.
 * Every text here is a labelled placeholder, never a culture fact, and every
 * picture is an abstract shape (no artwork pixels).
 *
 * Switch cases with localStorage key `rerupa:dev-mock-story`:
 *   (unset)    stories on
 *   "disabled" every story call answers 404 feature_disabled
 *   "none"     collection lessons answer 404 story_not_available
 *   "purged"   free-mode panels come back purged (24 h retention)
 *   "fail"     free-mode story jobs fail
 */
import { ApiError } from "./api-error";

export const DEV_COLLECTION_STORY_ID = "7c1d2e3f-4a5b-4c6d-8e7f-90a1b2c3d4e5";
const MODE_KEY = "rerupa:dev-mock-story";

function mode(): string | null {
  try {
    return localStorage.getItem(MODE_KEY);
  } catch {
    return null;
  }
}

export function storyFeatureCheck() {
  if (mode() === "disabled") {
    throw new ApiError("feature_disabled", "Fitur ini belum aktif.", { status: 404 });
  }
}

/** Abstract placeholder picture for panel `n`; says on its face that it is mock data. */
function panelSvg(n: number, kind: "generated" | "artwork_crop"): string {
  const hues = ["#8F7F6E", "#6F6A73", "#7D8A86", "#9C8576", "#8A7D8F", "#B3A48D"];
  const a = hues[n % hues.length];
  const b = hues[(n + 2) % hues.length];
  const body =
    kind === "artwork_crop"
      ? `<rect x="40" y="30" width="320" height="240" fill="${a}"/><rect x="80" y="70" width="240" height="160" fill="none" stroke="#fbf6ea" stroke-width="6"/>`
      : `<circle cx="${120 + n * 30}" cy="140" r="80" fill="${a}"/><path d="M0 300 Q200 ${160 + n * 10} 400 300 Z" fill="${b}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#e9dfcc"/>${body}<text x="200" y="285" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#1f1b17">Contoh panel ${n} (mock dev)</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Characters point at regions of the mock lesson: r02 → tahap 3, r12 → tahap 6, r99 → no stage. */
const CHARACTERS = [
  { code: "c1", name: "[Mock] Tokoh utama", description: "Contoh tokoh, bukan data budaya.", region_codes: ["r02"] },
  { code: "c2", name: "[Mock] Tokoh kedua", description: "Contoh tokoh di latar.", region_codes: ["r12", "r13"] },
  { code: "c3", name: "[Mock] Tokoh tanpa tahap", description: "Tidak ada tahap yang melukisnya.", region_codes: ["r99"] },
];

type PanelPlan = { kind: "generated" | "artwork_crop"; textOnly?: boolean; cast: string[] };
const PANELS: PanelPlan[] = [
  { kind: "generated", cast: ["c1"] },
  { kind: "artwork_crop", cast: ["c1", "c2"] },
  { kind: "generated", textOnly: true, cast: [] },
  { kind: "generated", cast: ["c2", "c3"] },
  { kind: "generated", cast: [] },
];

function narration(n: number): string {
  return `[Mock dev] Narasi contoh panel ${n}. Teks ini hanya untuk mengembangkan tampilan, bukan kisah sebenarnya.`;
}

const BASIS: Record<string, [string, string]> = {
  curated: ["Kisah bersumber", "Kisah disusun dari sumber yang ditinjau tim."],
  sourced: ["Kisah bersumber", "Kisah disusun dari sumber web tepercaya; tautan sumber tercantum."],
  user_hint: ["Berdasarkan info dari kamu", "Kisah disusun dari judul/seniman yang kamu isi; belum ada sumber yang menguatkan."],
  ai_interpretation: ["Interpretasi AI", "Kisah ini tafsiran AI, bukan fakta sejarah."],
};

const MOCK_SOURCE = { url: "https://example.org/rerupa-mock-sumber", title: "[Mock] Contoh sumber", domain: "example.org" };

// ── Free-mode stories and their jobs, in memory for this page load ──────────

type MockStory = {
  id: string;
  lessonId: string;
  basis: keyof typeof BASIS;
  identity: Record<string, string>;
  /** When panel 1 starts drawing; each panel takes PANEL_MS. */
  panelsFrom: number;
  purged: boolean;
};
type MockStoryJob = { id: string; createdAt: number; storyId: string; fail: boolean };

const stories = new Map<string, MockStory>();
const storyJobs = new Map<string, MockStoryJob>();
const SOURCES_MS = 900;
const STORYBOARD_MS = 2000;
const PANEL_MS = 2000;

function storyOut(s: MockStory) {
  const now = Date.now();
  const panels = PANELS.map((p, i) => {
    const n = i + 1;
    const done = now >= s.panelsFrom + PANEL_MS * n;
    const status = !done ? "pending" : p.textOnly ? "text_only" : "ready";
    const kind = p.textOnly ? "generated" : p.kind;
    const ready = status === "ready";
    return {
      order_no: n,
      narration: done || n === 1 ? narration(n) : "",
      kind,
      status,
      image_url: ready && !s.purged ? panelSvg(n, p.kind) : null,
      image_label: ready ? (kind === "artwork_crop" ? "Potongan karya asli" : "Ilustrasi AI") : null,
      purged: ready && s.purged,
      character_codes: p.cast,
      focus_region_codes: [],
    };
  });
  const generating = panels.some((p) => p.status === "pending");
  const [label, note] = BASIS[s.basis];
  const sourced = s.basis === "curated" || s.basis === "sourced";
  return {
    id: s.id,
    lesson_version_id: s.lessonId,
    status: generating ? "generating" : "ready",
    story_basis: s.basis,
    basis_label: label,
    basis_note: note,
    title: s.identity.title ?? "[Mock] Kisah contoh",
    summary: "[Mock dev] Ringkasan contoh. Semua isi cerita ini adalah data tiruan untuk pengembangan.",
    identity: s.identity,
    claims: [
      ...(sourced
        ? [{ text: "[Mock] Contoh klaim fakta yang punya tautan sumber.", type: "fakta", source_urls: [MOCK_SOURCE.url] }]
        : []),
      { text: "[Mock] Contoh perkiraan tanpa sumber.", type: "perkiraan", source_urls: [] },
      // A "fakta" without a link must still render as an estimate.
      { text: "[Mock] Klaim bertipe fakta tanpa tautan (harus tampil sebagai perkiraan).", type: "fakta", source_urls: [] },
    ],
    sources: sourced ? [MOCK_SOURCE] : [],
    characters: CHARACTERS,
    panels,
  };
}

const COLLECTION_STORY: MockStory = {
  id: DEV_COLLECTION_STORY_ID,
  lessonId: "",
  basis: "curated",
  identity: { title: "[Mock] Karya koleksi contoh", artist: "[Mock] Seniman", origin: "[Mock] Asal" },
  panelsFrom: 0,
  purged: false,
};

function storyJobOut(job: MockStoryJob) {
  const story = stories.get(job.storyId)!;
  const elapsed = Date.now() - job.createdAt;
  const end = story.panelsFrom - job.createdAt + PANEL_MS * PANELS.length;
  let step: string;
  if (elapsed < 500) step = "queued";
  else if (elapsed < SOURCES_MS) step = "sources";
  else if (elapsed < STORYBOARD_MS) step = "storyboard";
  else if (elapsed < end) step = `panel_${Math.min(PANELS.length, Math.floor((elapsed - STORYBOARD_MS) / PANEL_MS) + 1)}`;
  else step = "done";
  const failed = job.fail && elapsed >= SOURCES_MS;
  const done = step === "done" || failed;
  return {
    id: job.id,
    type: "generate_story",
    status: failed ? "failed" : done ? "succeeded" : step === "queued" ? "queued" : "processing",
    is_final: done,
    progress: { step: done ? "done" : step },
    result: done && !failed ? { kind: "story", story_id: job.storyId } : null,
    error_code: failed ? "ai_unavailable" : null,
    error_message: failed ? "[Mock] Layanan AI sedang tidak tersedia. Coba lagi nanti." : null,
    lesson_version_id: story.lessonId,
    created_at: new Date(job.createdAt).toISOString(),
    finished_at: done ? new Date().toISOString() : null,
  };
}

/** `POST /lessons/{id}/story`. `freeMode`: the session owns this lesson (it was generated from a photo). */
export function mockStartStory(lessonId: string, body: Record<string, unknown>, freeMode: boolean) {
  storyFeatureCheck();
  if (!freeMode) {
    if (mode() === "none") throw new ApiError("story_not_available", "Kisah karya ini belum tersedia.", { status: 404 });
    return { story_id: DEV_COLLECTION_STORY_ID };
  }
  // A story already made (or being made) for this lesson comes back straight away (200).
  const existing = [...stories.values()].find(
    (s) => s.lessonId === lessonId && ![...storyJobs.values()].some((j) => j.storyId === s.id && j.fail),
  );
  const job = existing && [...storyJobs.values()].find((j) => j.storyId === existing.id);
  if (existing && job && Date.now() - job.createdAt >= STORYBOARD_MS) return { story_id: existing.id };
  if (job) return { job: storyJobOut(job) };
  if ([...storyJobs.values()].filter((j) => stories.get(j.storyId)?.lessonId === lessonId).length >= 4) {
    throw new ApiError("story_quota_exceeded", "Batas pembuatan cerita untuk tutorial ini tercapai.", { status: 429 });
  }

  const str = (k: string) => (typeof body[k] === "string" && (body[k] as string).trim() ? (body[k] as string) : null);
  const hints = { title: str("title_hint"), artist: str("artist_hint"), origin: str("origin_hint") };
  const hasHints = Boolean(hints.title || hints.artist || hints.origin);
  const consent = body.consent_ai_photo === true;
  let basis: MockStory["basis"];
  let identity: Record<string, string>;
  if (body.interpretation_only === true || (!hasHints && !consent)) {
    basis = "ai_interpretation";
    identity = {};
  } else if (hasHints) {
    basis = "user_hint";
    identity = Object.fromEntries(Object.entries({ ...hints, source: "user" }).filter(([, v]) => v)) as Record<string, string>;
  } else {
    basis = "sourced";
    identity = {
      title: "[Mock] Karya yang dikenali agen",
      artist: "[Mock] Seniman dugaan",
      source: "ai_research",
      confidence: "medium",
      reason: "[Mock] Alasan contoh: pola dan warna mirip dengan sumber tiruan.",
    };
  }
  const now = Date.now();
  const story: MockStory = {
    id: crypto.randomUUID(),
    lessonId,
    basis,
    identity,
    panelsFrom: now + STORYBOARD_MS,
    purged: mode() === "purged",
  };
  stories.set(story.id, story);
  const newJob: MockStoryJob = { id: crypto.randomUUID(), createdAt: now, storyId: story.id, fail: mode() === "fail" };
  storyJobs.set(newJob.id, newJob);
  return { job: storyJobOut(newJob) };
}

/** `GET /jobs/{id}` for a story job, or null when the id is not one. */
export function mockStoryJob(id: string) {
  const job = storyJobs.get(id);
  return job ? storyJobOut(job) : null;
}

/** `GET /stories/{id}`. */
export function mockGetStory(id: string, collectionLessonId: string) {
  storyFeatureCheck();
  if (id === DEV_COLLECTION_STORY_ID && mode() !== "none") {
    return storyOut({ ...COLLECTION_STORY, lessonId: collectionLessonId });
  }
  const s = stories.get(id);
  const job = s && [...storyJobs.values()].find((j) => j.storyId === id);
  // Not visible before the storyboard exists, nor after a failed job.
  if (!s || !job || job.fail || Date.now() - job.createdAt < STORYBOARD_MS) {
    throw new ApiError("not_found", "Cerita tidak ditemukan.", { status: 404 });
  }
  return storyOut(s);
}
