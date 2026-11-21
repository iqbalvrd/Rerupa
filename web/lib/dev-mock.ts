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

export async function mockRequest(method: string, path: string, body: unknown): Promise<unknown> {
  // Small delay so loading states are visible, like a real network.
  await new Promise((r) => setTimeout(r, 250));
  const json = (body ?? {}) as Record<string, unknown>;

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
