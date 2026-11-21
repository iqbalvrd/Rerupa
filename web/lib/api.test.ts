import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, isApiError } from "./api";

const JOB = {
  id: "9f6a6dc4-f529-4ec5-b68d-f6fe8ddd0e68",
  type: "generate_lesson",
  status: "queued",
  is_final: false,
  progress: { step: "queued" },
  result: null,
  error_code: null,
  error_message: null,
  lesson_version_id: null,
  created_at: "2026-11-21T08:15:02.420+00:00",
  finished_at: null,
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request basics", () => {
  it("always sends the session cookie", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    await api.listArtworks();
    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe("include");
  });

  it("adds query params only when set", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    await api.getLesson("abc", { paletteId: "p1" }).catch(() => {});
    await api.getLesson("abc").catch(() => {});
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/lessons\/abc\?palette_id=p1$/);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/lessons\/abc$/);
  });
});

describe("job-creating endpoints", () => {
  it("send Idempotency-Key and multipart fields", async () => {
    fetchMock.mockResolvedValue(jsonResponse(JOB, 202));
    const file = new Blob(["x"], { type: "image/jpeg" });
    await api.generateLesson({
      file,
      consentAiPhoto: true,
      scope: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
      idempotencyKey: "key-1",
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("key-1");
    const form = init.body as FormData;
    expect(form.get("consent_ai_photo")).toBe("true");
    expect(JSON.parse(form.get("scope") as string)).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("round checkpoint corners to whole pixels", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...JOB, type: "feedback" }, 202));
    await api.createCheckpoint("s1", {
      file: new Blob(["x"]),
      stageCode: "stage_2",
      corners: [0.4, 1.6, 100.5, 2, 99, 200.2, 1, 199],
      consentAiPhoto: false,
      idempotencyKey: "key-2",
    });
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(JSON.parse(form.get("corners") as string)).toEqual([0, 2, 101, 2, 99, 200, 1, 199]);
  });
});

describe("errors", () => {
  it("map the API error body to ApiError", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "quota_exceeded", message: "Batas tercapai." } }, 429, { "Retry-After": "7" }),
    );
    const err = await api.listArtworks().catch((e) => e);
    expect(isApiError(err, "quota_exceeded")).toBe(true);
    expect(err.message).toBe("Batas tercapai.");
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(7);
  });

  it("keep validation field names", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "validation_error", message: "Data tidak valid.", fields: ["body.scope"] } }, 422),
    );
    const err = await api.listArtworks().catch((e) => e);
    expect(err.fields).toEqual(["body.scope"]);
  });

  it("use a generic message when the body is not the API shape", async () => {
    fetchMock.mockResolvedValue(new Response("Bad Gateway", { status: 502 }));
    const err = await api.listArtworks().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("internal_error");
  });

  it("report a network failure as code network", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await api.listArtworks().catch((e) => e);
    expect(isApiError(err, "network")).toBe(true);
  });

  it("report a response that breaks the contract as bad_response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: true }));
    const err = await api.getJob(JOB.id).catch((e) => e);
    expect(isApiError(err, "bad_response")).toBe(true);
  });

  it("let a caller abort propagate as AbortError", async () => {
    fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));
    const err = await api.listArtworks(new AbortController().signal).catch((e) => e);
    expect(err.name).toBe("AbortError");
  });
});

describe("trackEvent", () => {
  it("never throws", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.trackEvent("lesson_viewed", { stage_order: 1 })).resolves.toBeUndefined();
  });
});
