/**
 * Guest session state.
 *
 * The session token lives in the httpOnly `rerupa_session` cookie. Browsers that
 * block that cross-site cookie (Safari iOS) use the copy kept by `session-token.ts`,
 * sent as `X-Session-Token`. We also remember the session *id* (needed in URLs such
 * as `/sessions/{id}/progress`) so a reload can restore the practice. The id is
 * not a credential: the API authorizes every call against the cookie or token.
 */
import type { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { api, isApiError } from "./api";
import type { Session } from "./schemas";
import { setSessionToken } from "./session-token";

/** localStorage can be missing or throw (private mode, blocked storage). Never let that break the app. */
const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // ignore: the session still works for this page view
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

type SessionState = {
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      sessionId: null,
      setSessionId: (sessionId) => {
        if (!sessionId) setSessionToken(null); // the token belongs to the forgotten session
        set({ sessionId });
      },
    }),
    {
      name: "rerupa-session",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (s) => ({ sessionId: s.sessionId }),
    },
  ),
);

/** A stored session id that the API no longer accepts (expired, deleted, other browser). */
function isGone(err: unknown): boolean {
  return isApiError(err, "session_required") || isApiError(err, "not_found");
}

let pending: Promise<Session> | null = null;

/**
 * Return the current guest session, creating one if needed.
 * Call this right before an action that needs a session (start practice,
 * upload), not on page load: browsing the gallery needs no session.
 * Concurrent calls share one request, so a double tap never creates two sessions.
 */
export function ensureSession(): Promise<Session> {
  pending ??= (async () => {
    const { sessionId, setSessionId } = useSessionStore.getState();
    if (sessionId) {
      try {
        return await api.getSession(sessionId);
      } catch (err) {
        if (!isGone(err)) throw err;
        setSessionId(null);
      }
    }
    const created = await api.createSession();
    setSessionToken(created.session_token);
    setSessionId(created.id);
    return created;
  })().finally(() => {
    pending = null;
  });
  return pending;
}

/**
 * Run `fn` with a valid session id. If the API says the session is gone
 * mid-way (`session_required`), make a new session and retry once.
 */
export async function withSession<T>(fn: (sessionId: string) => Promise<T>): Promise<T> {
  const session = await ensureSession();
  try {
    return await fn(session.id);
  } catch (err) {
    if (!isApiError(err, "session_required")) throw err;
    useSessionStore.getState().setSessionId(null);
    const fresh = await ensureSession();
    return fn(fresh.id);
  }
}

/** Delete the session on the server, then forget it locally. */
export async function endSession(): Promise<void> {
  const { sessionId, setSessionId } = useSessionStore.getState();
  if (sessionId) {
    try {
      await api.deleteSession(sessionId);
    } catch (err) {
      if (!isGone(err)) throw err;
    }
  }
  setSessionId(null);
}

/** TanStack Query key of the current session (pages read it via `ensureSession`). */
export const SESSION_QUERY_KEY = ["session"] as const;

/**
 * Put a session the API just returned into the query cache.
 *
 * Pages that read `["session"]` render straight from the cache. Only invalidating it after
 * the lesson changed (a free-mode tutorial finished, or a collection artwork was picked)
 * let /persiapan and /latihan first render the previous lesson, which then stuck around
 * whenever the refetch lost a race. Writing the fresh session makes the next page right on
 * its first render. Progress belongs to one lesson, so it is dropped when the lesson changes.
 */
export function rememberSession(queryClient: QueryClient, session: Session): void {
  const previous = queryClient.getQueryData<Session>(SESSION_QUERY_KEY);
  if (previous?.id !== session.id || previous?.lesson_version_id !== session.lesson_version_id) {
    queryClient.removeQueries({ queryKey: ["progress"] });
  }
  queryClient.setQueryData(SESSION_QUERY_KEY, session);
}
