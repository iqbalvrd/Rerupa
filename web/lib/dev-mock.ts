/**
 * Dev-only API mock, for building screens while the API cannot run locally
 * (no api/.env). Enabled with NEXT_PUBLIC_API_MOCK=1; never in production.
 *
 * Answers from the backend's own response examples (api/examples, copied to
 * public/_dev/api by `npm run fixtures`), so the shapes are the real contract.
 * The guest session lives in memory + localStorage, like a cookie would.
 */
import { ApiError } from "./api-error";

export const DEV_MOCK_API = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_API_MOCK === "1";

/** The example lesson (api/examples/lesson_detail.json) every mock practice uses. */
export const DEV_LESSON_ID = "e4cfabb9-24a3-4317-8cc6-f453cfb90b7c";

const SESSION_KEY = "rerupa:dev-mock-session";

async function example(name: string): Promise<unknown> {
  const res = await fetch(`/_dev/api/${name}.json`);
  if (!res.ok) throw new ApiError("internal_error", "Data contoh API belum dibuat. Jalankan `npm run fixtures`.");
  return res.json();
}

type MockSession = Record<string, unknown> & { id: string };

function loadSession(): MockSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as MockSession) : null;
  } catch {
    return null;
  }
}

function saveSession(s: MockSession | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

function sessionRequired(): never {
  throw new ApiError("session_required", "Sesi tidak ditemukan. Mulai sesi baru.", { status: 401 });
}

// ── Mock jobs (checkpoint feedback), kept in memory for this page load ──────

type MockJob = {
  id: string;
  type: "feedback" | "generate_lesson";
  createdAt: number;
  stageCode: string;
  outcome: "succeeded" | "needs_retake";
  errorCode: string | null;
  photoUrl: string | null;
};
const jobs = new Map<string, MockJob>();

/** Feedback job timeline, roughly like the API's ±6–8 s on a laptop, sped up. */
const FEEDBACK_STEPS: [number, string][] = [
  [600, "queued"],
  [1800, "cv"],
  [2800, "writing"],
  [3400, "saving"],
];

/** Lesson job timeline (API: ±10–15 s without AI on a laptop), sped up. */
const LESSON_STEPS: [number, string][] = [
  [700, "queued"],
  [2200, "cv"],
  [3300, "planning"],
  [4300, "colors"],
  [5600, "writing"],
  [6200, "saving"],
];

const RETAKE_MESSAGES: Record<string, string> = {
  photo_unusable: "Foto kurang jelas. Coba ambil ulang di tempat terang.",
  not_artwork: "Sepertinya bukan karya lukis. Pilih dari galeri?",
};

function jobOut(job: MockJob) {
  const steps = job.type === "feedback" ? FEEDBACK_STEPS : LESSON_STEPS;
  const elapsed = Date.now() - job.createdAt;
  const step = steps.find(([until]) => elapsed < until)?.[1];
  const done = step === undefined;
  const succeeded = done && job.outcome === "succeeded";
  return {
    id: job.id,
    type: job.type,
    status: done ? job.outcome : step === "queued" ? "queued" : "processing",
    is_final: done,
    progress: { step: done ? "done" : step },
    result: succeeded && job.type === "generate_lesson" ? { text_source: "template" } : null,
    error_code: done && job.outcome === "needs_retake" ? job.errorCode : null,
    error_message: done && job.errorCode ? (RETAKE_MESSAGES[job.errorCode] ?? null) : null,
    lesson_version_id: succeeded && job.type === "generate_lesson" ? DEV_LESSON_ID : null,
    created_at: new Date(job.createdAt).toISOString(),
    finished_at: done ? new Date(job.createdAt + steps.at(-1)![0]).toISOString() : null,
  };
}

/** Area of the tapped quadrilateral as a share of the photo (shoelace formula). */
function cornerArea(corners: number[], w: number, h: number): number {
  const pts = [0, 1, 2, 3].map((i) => [corners[i * 2], corners[i * 2 + 1]]);
  const cx = pts.reduce((a, p) => a + p[0], 0) / 4;
  const cy = pts.reduce((a, p) => a + p[1], 0) / 4;
  pts.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % 4];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2 / (w * h || 1);
}

async function imageSize(file: Blob): Promise<[number, number]> {
  try {
    const bmp = await createImageBitmap(file);
    const size: [number, number] = [bmp.width, bmp.height];
    bmp.close();
    return size;
  } catch {
    return [1, 1];
  }
}

export async function mockRequest(method: string, path: string, body: unknown, form?: FormData): Promise<unknown> {
  // Small delay so loading states are visible, like a real network.
  await new Promise((r) => setTimeout(r, 250));
  const json = (body ?? {}) as Record<string, unknown>;

  // POST /sessions/{id}/checkpoints → feedback job. A tiny tapped area (corners
  // bunched together) answers like a failed alignment, to exercise "foto ulang".
  const createCheckpoint = path.match(/^\/sessions\/([^/]+)\/checkpoints$/);
  if (createCheckpoint && method === "POST" && form) {
    const session = loadSession();
    if (!session || session.id !== createCheckpoint[1]) sessionRequired();
    const file = form.get("file");
    const corners = JSON.parse(String(form.get("corners") ?? "[]")) as number[];
    const [w, h] = file instanceof Blob ? await imageSize(file) : [1, 1];
    const job: MockJob = {
      id: crypto.randomUUID(),
      type: "feedback",
      createdAt: Date.now(),
      stageCode: String(form.get("stage_code")),
      outcome: corners.length === 8 && cornerArea(corners, w, h) >= 0.15 ? "succeeded" : "needs_retake",
      errorCode: corners.length === 8 && cornerArea(corners, w, h) >= 0.15 ? null : "alignment_failed",
      photoUrl: file instanceof Blob ? URL.createObjectURL(file) : null,
    };
    jobs.set(job.id, job);
    return jobOut(job);
  }
  // POST /lessons/generate → generate_lesson job; on success the lesson is
  // attached to the session (API.md). A very small photo answers photo_unusable.
  if (path === "/lessons/generate" && method === "POST" && form) {
    const session = loadSession();
    if (!session) sessionRequired();
    const file = form.get("file");
    const [w, h] = file instanceof Blob ? await imageSize(file) : [0, 0];
    const usable = Math.max(w, h) >= 400;
    const job: MockJob = {
      id: crypto.randomUUID(),
      type: "generate_lesson",
      createdAt: Date.now(),
      stageCode: "",
      outcome: usable ? "succeeded" : "needs_retake",
      errorCode: usable ? null : "photo_unusable",
      photoUrl: null,
    };
    jobs.set(job.id, job);
    if (usable) saveSession({ ...session, lesson_version_id: DEV_LESSON_ID, progress: {}, current_stage_order: 1 });
    return jobOut(job);
  }
  const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
  if (jobMatch && method === "GET") {
    const job = jobs.get(jobMatch[1]);
    if (!job) throw new ApiError("not_found", "Pekerjaan tidak ditemukan.", { status: 404 });
    return jobOut(job);
  }
  const checkpointResult = path.match(/^\/sessions\/([^/]+)\/checkpoints\/([^/]+)$/);
  if (checkpointResult && method === "GET") {
    const job = jobs.get(checkpointResult[2]);
    if (!job) throw new ApiError("not_found", "Checkpoint tidak ditemukan.", { status: 404 });
    const base = (await example(job.outcome === "succeeded" ? "checkpoint_feedback" : "checkpoint_retake")) as Record<string, unknown>;
    return {
      ...base,
      job_id: job.id,
      stage_code: job.stageCode,
      photo_url: job.outcome === "succeeded" ? job.photoUrl : null,
    };
  }

  if (method === "GET" && path === "/health") return { status: "ok", mock: true };
  if (method === "GET" && path === "/palettes") return example("palettes");
  // Synthetic lesson: the example lesson with shape layers that actually load.
  if (method === "GET" && path.startsWith("/lessons/")) return example("lesson_mock");

  const progressMatch = path.match(/^\/sessions\/([^/]+)\/progress$/);
  if (progressMatch) {
    const session = loadSession();
    if (!session || session.id !== progressMatch[1]) sessionRequired();
    const lesson = (await example("lesson_mock")) as {
      stages: { code: string; order_no: number; is_checkpoint: boolean }[];
    };
    const state = (session.progress ?? {}) as Record<string, { status: string; viewed_at: string | null; completed_at: string | null }>;
    if (method === "PATCH") {
      const { stage_code, status } = json as { stage_code: string; status: "viewed" | "completed" };
      if (!lesson.stages.some((s) => s.code === stage_code)) {
        throw new ApiError("not_found", "Tahap tidak ditemukan.", { status: 404 });
      }
      const now = new Date().toISOString();
      const prev = state[stage_code] ?? { status: "not_started", viewed_at: null, completed_at: null };
      // Viewing never downgrades a completed stage (API.md, "Progres latihan").
      state[stage_code] =
        status === "completed"
          ? { status: "completed", viewed_at: prev.viewed_at ?? now, completed_at: prev.completed_at ?? now }
          : { ...prev, status: prev.status === "completed" ? "completed" : "viewed", viewed_at: prev.viewed_at ?? now };
      const order = lesson.stages.find((s) => s.code === stage_code)!.order_no;
      saveSession({ ...session, progress: state, current_stage_order: order });
    }
    const stages = lesson.stages.map((s) => ({
      code: s.code,
      order_no: s.order_no,
      is_checkpoint: s.is_checkpoint,
      status: state[s.code]?.status ?? "not_started",
      viewed_at: state[s.code]?.viewed_at ?? null,
      completed_at: state[s.code]?.completed_at ?? null,
      feedback_count: 0,
    }));
    return {
      lesson_version_id: session.lesson_version_id ?? DEV_LESSON_ID,
      current_stage_order: (loadSession()?.current_stage_order as number | undefined) ?? 1,
      completed_count: stages.filter((s) => s.status === "completed").length,
      stage_count: stages.length,
      stages,
    };
  }

  if (path === "/sessions" && method === "POST") {
    const base = (await example("session")) as MockSession;
    const session = { ...base, id: crypto.randomUUID(), lesson_version_id: null, palette_id: null, ...json };
    saveSession(session);
    return session;
  }

  const sessionMatch = path.match(/^\/sessions\/([^/]+)$/);
  if (sessionMatch) {
    const session = loadSession();
    if (!session || session.id !== sessionMatch[1]) sessionRequired();
    if (method === "GET") return session;
    if (method === "PATCH") {
      const next = { ...session, ...Object.fromEntries(Object.entries(json).filter(([, v]) => v !== undefined)) };
      saveSession(next);
      return next;
    }
    if (method === "DELETE") {
      saveSession(null);
      return undefined;
    }
  }

  if (path === "/events") return undefined;

  throw new ApiError("not_found", `Mock API belum mendukung ${method} ${path}.`, { status: 404 });
}
