import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    api: { getSession: vi.fn(), createSession: vi.fn(), deleteSession: vi.fn() },
  };
});

const { api, ApiError } = await import("./api");
const { ensureSession, withSession, endSession, rememberSession, useSessionStore, SESSION_QUERY_KEY } = await import("./session-store");
const { QueryClient } = await import("@tanstack/react-query");

const session = (id: string) => ({
  id,
  lesson_version_id: null,
  palette_id: null,
  canvas_size: null,
  current_stage_order: 1,
  consent: {},
  expires_at: "2026-11-28T00:00:00+00:00",
});

const getSession = vi.mocked(api.getSession);
const createSession = vi.mocked(api.createSession);
const deleteSession = vi.mocked(api.deleteSession);

beforeEach(() => {
  vi.clearAllMocks();
  useSessionStore.setState({ sessionId: null });
});

describe("ensureSession", () => {
  it("creates a session when none is stored", async () => {
    createSession.mockResolvedValue(session("new"));
    await expect(ensureSession()).resolves.toMatchObject({ id: "new" });
    expect(useSessionStore.getState().sessionId).toBe("new");
  });

  it("restores the stored session", async () => {
    useSessionStore.setState({ sessionId: "old" });
    getSession.mockResolvedValue(session("old"));
    await ensureSession();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("replaces a stored session the API no longer knows", async () => {
    useSessionStore.setState({ sessionId: "old" });
    getSession.mockRejectedValue(new ApiError("session_required", "x", { status: 401 }));
    createSession.mockResolvedValue(session("new"));
    await ensureSession();
    expect(useSessionStore.getState().sessionId).toBe("new");
  });

  it("keeps the stored session on a network error", async () => {
    useSessionStore.setState({ sessionId: "old" });
    getSession.mockRejectedValue(new ApiError("network", "x"));
    await expect(ensureSession()).rejects.toMatchObject({ code: "network" });
    expect(useSessionStore.getState().sessionId).toBe("old");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("shares one request between concurrent callers", async () => {
    createSession.mockResolvedValue(session("new"));
    await Promise.all([ensureSession(), ensureSession(), ensureSession()]);
    expect(createSession).toHaveBeenCalledTimes(1);
  });
});

describe("withSession", () => {
  it("retries once with a new session after session_required", async () => {
    useSessionStore.setState({ sessionId: "old" });
    getSession.mockResolvedValue(session("old"));
    createSession.mockResolvedValue(session("new"));
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("session_required", "x", { status: 401 }))
      .mockResolvedValueOnce("ok");
    await expect(withSession(fn)).resolves.toBe("ok");
    expect(fn.mock.calls.map((c) => c[0])).toEqual(["old", "new"]);
  });
});

describe("endSession", () => {
  it("deletes on the server and forgets locally", async () => {
    useSessionStore.setState({ sessionId: "old" });
    deleteSession.mockResolvedValue(undefined);
    await endSession();
    expect(deleteSession).toHaveBeenCalledWith("old");
    expect(useSessionStore.getState().sessionId).toBeNull();
  });
});

describe("rememberSession", () => {
  const withLesson = (id: string, lesson: string | null) => ({ ...session(id), lesson_version_id: lesson });

  it("replaces a cached session that still points at the previous lesson", () => {
    const qc = new QueryClient();
    qc.setQueryData(SESSION_QUERY_KEY, withLesson("s1", "collection-lesson"));
    qc.setQueryData(["progress", "s1"], { current_stage_order: 8 });

    rememberSession(qc, withLesson("s1", "free-mode-lesson"));

    expect(qc.getQueryData(SESSION_QUERY_KEY)).toMatchObject({ lesson_version_id: "free-mode-lesson" });
    expect(qc.getQueryData(["progress", "s1"])).toBeUndefined();
  });

  it("keeps progress when the lesson is unchanged", () => {
    const qc = new QueryClient();
    qc.setQueryData(SESSION_QUERY_KEY, withLesson("s1", "l1"));
    qc.setQueryData(["progress", "s1"], { current_stage_order: 3 });

    rememberSession(qc, { ...withLesson("s1", "l1"), canvas_size: "A3" });

    expect(qc.getQueryData(["progress", "s1"])).toEqual({ current_stage_order: 3 });
    expect(qc.getQueryData(SESSION_QUERY_KEY)).toMatchObject({ canvas_size: "A3" });
  });

  it("drops progress of a replaced session", () => {
    const qc = new QueryClient();
    qc.setQueryData(SESSION_QUERY_KEY, withLesson("old", "l1"));
    qc.setQueryData(["progress", "old"], { current_stage_order: 5 });

    rememberSession(qc, withLesson("new", "l1"));

    expect(qc.getQueryData(["progress", "old"])).toBeUndefined();
    expect(qc.getQueryData(SESSION_QUERY_KEY)).toMatchObject({ id: "new" });
  });
});
