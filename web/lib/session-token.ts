/**
 * Fallback session credential for browsers that block the cross-site session cookie
 * (Safari on iOS, private mode): the web app (*.vercel.app) and the API (*.up.railway.app)
 * are different sites, so `rerupa_session` counts as a third-party cookie there.
 *
 * `POST /sessions` also returns the token in the body; we keep it in localStorage and send it
 * as `X-Session-Token` on every request. The API accepts either the cookie or this header.
 */
const KEY = "rerupa-session-token";
let memory: string | null = null;

export function getSessionToken(): string | null {
  if (memory) return memory;
  try {
    memory = window.localStorage.getItem(KEY);
  } catch {
    // storage blocked: the in-memory copy still works for this page view
  }
  return memory;
}

export function setSessionToken(token: string | null | undefined): void {
  memory = token ?? null;
  try {
    if (memory) window.localStorage.setItem(KEY, memory);
    else window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
