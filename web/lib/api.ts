/**
 * Rerupa API client. Contract: `api/API.md`.
 *
 * - Every request sends the httpOnly session cookie (`credentials: "include"`).
 * - Endpoints that create a job take an `idempotencyKey`: one new UUID per user
 *   action, reused when retrying that same action (see `newIdempotencyKey`).
 * - Errors are always `{ error: { code, message } }` and surface as `ApiError`.
 *   Show `message` to the user; branch on `code`.
 * - Responses are parsed with the Zod schemas in `lib/schemas.ts`, so a contract
 *   drift fails loudly here instead of deep inside a component.
 */
import { z } from "zod";
import {
  ApiErrorBody,
  ArtworkCard,
  ArtworkDetail,
  Checkpoint,
  Job,
  Lesson,
  Palette,
  Progress,
  Recipe,
  Session,
  type Corners,
  type EventName,
  type EventProps,
  type Scope,
  type SessionCreate,
  type SessionUpdate,
} from "./schemas";

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(
  /\/+$/,
  "",
);

/** Default deadline for ordinary requests. Uploads get longer (they carry up to 10 MB). */
const DEFAULT_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 60_000;

/** Message shown when the API could not be reached at all. */
const NETWORK_MESSAGE = "Tidak bisa terhubung ke server. Periksa koneksi, lalu coba lagi.";
const TIMEOUT_MESSAGE = "Server terlalu lama menjawab. Coba lagi sebentar lagi.";
const GENERIC_MESSAGE = "Terjadi kesalahan. Coba lagi.";

export class ApiError extends Error {
  /** API error code (`session_required`, `quota_exceeded`, …) or a client code: `network`, `timeout`, `bad_response`. */
  readonly code: string;
  /** HTTP status, or 0 when no response arrived. */
  readonly status: number;
  /** Seconds from the `Retry-After` header on 429, when the browser can read it. */
  readonly retryAfter: number | null;
  /** Invalid field names on 422 `validation_error`. */
  readonly fields: string[];

  constructor(
    code: string,
    message: string,
    opts: { status?: number; retryAfter?: number | null; fields?: string[]; cause?: unknown } = {},
  ) {
    super(message, { cause: opts.cause });
    this.name = "ApiError";
    this.code = code;
    this.status = opts.status ?? 0;
    this.retryAfter = opts.retryAfter ?? null;
    this.fields = opts.fields ?? [];
  }
}

export function isApiError(err: unknown, code?: string): err is ApiError {
  return err instanceof ApiError && (code === undefined || err.code === code);
}

/** One key per user action. Reuse the same key when retrying that action. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  json?: unknown;
  form?: FormData;
  query?: Record<string, string | undefined>;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

async function request<T>(path: string, schema: z.ZodType<T> | null, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(API_BASE_URL + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, v);
  }

  const headers = new Headers({ Accept: "application/json" });
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = opts.form; // the browser sets the multipart boundary
  }
  if (opts.idempotencyKey) headers.set("Idempotency-Key", opts.idempotencyKey);

  const timeout = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body,
      credentials: "include",
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ApiError("timeout", TIMEOUT_MESSAGE, { cause: err });
    }
    if (err instanceof DOMException && err.name === "AbortError") throw err; // caller cancelled; let it propagate
    throw new ApiError("network", NETWORK_MESSAGE, { cause: err });
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204 || schema === null) return undefined as T;

  let data: unknown;
  try {
    data = await res.json();
  } catch (err) {
    throw new ApiError("bad_response", GENERIC_MESSAGE, { status: res.status, cause: err });
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    // Contract drift between Pydantic and Zod. Log the details for developers only.
    console.error(`[api] ${opts.method ?? "GET"} ${path}: response did not match schema`, parsed.error.issues);
    throw new ApiError("bad_response", GENERIC_MESSAGE, { status: res.status, cause: parsed.error });
  }
  return parsed.data;
}

async function toApiError(res: Response): Promise<ApiError> {
  const retryHeader = res.headers.get("Retry-After");
  const retryAfter = retryHeader !== null && /^\d+$/.test(retryHeader) ? Number(retryHeader) : null;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON error (proxy, gateway). Fall through to the generic message.
  }
  const parsed = ApiErrorBody.safeParse(body);
  if (parsed.success) {
    const { code, message, fields } = parsed.data.error;
    return new ApiError(code, message, { status: res.status, retryAfter, fields });
  }
  return new ApiError(res.status >= 500 ? "internal_error" : "http_error", GENERIC_MESSAGE, {
    status: res.status,
    retryAfter,
  });
}

// ── Endpoints ─────────────────────────────────────────────────────────────

export const api = {
  health: (signal?: AbortSignal) =>
    request("/health", z.record(z.string(), z.unknown()), { signal }),

  // Gallery
  listArtworks: (signal?: AbortSignal) => request("/artworks", z.array(ArtworkCard), { signal }),
  getArtwork: (slug: string, signal?: AbortSignal) =>
    request(`/artworks/${encodeURIComponent(slug)}`, ArtworkDetail, { signal }),

  // Guest session (cookie set by the API on create)
  createSession: (body: SessionCreate = {}) =>
    request("/sessions", Session, { method: "POST", json: body }),
  getSession: (id: string, signal?: AbortSignal) => request(`/sessions/${id}`, Session, { signal }),
  updateSession: (id: string, body: SessionUpdate) =>
    request(`/sessions/${id}`, Session, { method: "PATCH", json: body }),
  deleteSession: (id: string) => request(`/sessions/${id}`, null, { method: "DELETE" }),

  // Free-mode lesson generation → job
  generateLesson: (input: {
    file: Blob;
    consentAiPhoto: boolean;
    scope?: Scope | null;
    idempotencyKey: string;
  }) => {
    const form = new FormData();
    form.append("file", input.file);
    form.append("consent_ai_photo", String(input.consentAiPhoto));
    if (input.scope) form.append("scope", JSON.stringify(input.scope));
    return request("/lessons/generate", Job, {
      method: "POST",
      form,
      idempotencyKey: input.idempotencyKey,
      timeoutMs: UPLOAD_TIMEOUT_MS,
    });
  },
  getJob: (id: string, signal?: AbortSignal) => request(`/jobs/${id}`, Job, { signal }),

  getLesson: (id: string, opts: { paletteId?: string; signal?: AbortSignal } = {}) =>
    request(`/lessons/${id}`, Lesson, { query: { palette_id: opts.paletteId }, signal: opts.signal }),

  // Colors
  listPalettes: (signal?: AbortSignal) => request("/palettes", z.array(Palette), { signal }),
  getRecipe: (id: string, signal?: AbortSignal) => request(`/recipes/${id}`, Recipe, { signal }),

  // Practice progress. Viewing a stage never completes it.
  getProgress: (sessionId: string, signal?: AbortSignal) =>
    request(`/sessions/${sessionId}/progress`, Progress, { signal }),
  updateProgress: (sessionId: string, body: { stage_code: string; status: "viewed" | "completed" }) =>
    request(`/sessions/${sessionId}/progress`, Progress, { method: "PATCH", json: body }),

  // Checkpoints → job of type "feedback"
  createCheckpoint: (
    sessionId: string,
    input: {
      file: Blob;
      stageCode: string;
      corners: Corners;
      consentAiPhoto: boolean;
      idempotencyKey: string;
    },
  ) => {
    const form = new FormData();
    form.append("file", input.file);
    form.append("stage_code", input.stageCode);
    form.append("corners", JSON.stringify(input.corners.map((n) => Math.round(n))));
    form.append("consent_ai_photo", String(input.consentAiPhoto));
    return request(`/sessions/${sessionId}/checkpoints`, Job, {
      method: "POST",
      form,
      idempotencyKey: input.idempotencyKey,
      timeoutMs: UPLOAD_TIMEOUT_MS,
    });
  },
  listCheckpoints: (sessionId: string, signal?: AbortSignal) =>
    request(`/sessions/${sessionId}/checkpoints`, z.array(Checkpoint), { signal }),
  getCheckpoint: (sessionId: string, jobId: string, signal?: AbortSignal) =>
    request(`/sessions/${sessionId}/checkpoints/${jobId}`, Checkpoint, { signal }),

  // Analytics. Fire-and-forget: a failed event must never break the UI.
  trackEvent: (name: EventName, props: EventProps = {}) =>
    request("/events", null, { method: "POST", json: { name, props } }).catch(() => undefined),
};
