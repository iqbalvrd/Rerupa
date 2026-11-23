/**
 * Accounts: sign up / sign in / sign out with Supabase Auth, and the signed-in user (with the
 * role the API reports — never a role the client decides).
 *
 * Guests may browse the gallery and artwork pages. Practising (a session, uploads, checkpoints)
 * needs an account: wrap those pages in `<RequireLogin>`.
 */
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { api, isApiError } from "./api";
import { DEV_MOCK_API } from "./dev-mock";
import type { Me } from "./schemas";
import { useSessionStore } from "./session-store";
import { getAccessToken, getSupabase } from "./supabase";

export const ME_QUERY_KEY = ["me"] as const;

export type AuthState =
  | { status: "loading"; user: null }
  | { status: "signedOut"; user: null }
  | { status: "signedIn"; user: Me };

async function fetchMe(): Promise<Me | null> {
  if (DEV_MOCK_API) return api.me(); // the mock answers with a signed-in demo user
  if (!(await getAccessToken())) return null;
  try {
    return await api.me();
  } catch (err) {
    if (isApiError(err, "login_required")) return null; // token revoked or expired beyond refresh
    throw err;
  }
}

export function useAuth(): AuthState {
  const me = useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe, staleTime: 5 * 60_000, retry: 1 });
  if (me.isPending) return { status: "loading", user: null };
  if (me.data) return { status: "signedIn", user: me.data };
  return { status: "signedOut", user: null };
}

/** Keep `["me"]` in sync with Supabase Auth events (sign-in in another tab, expiry, email link). */
export function subscribeAuth(queryClient: QueryClient): () => void {
  const sb = getSupabase();
  if (!sb) return () => undefined;
  const { data } = sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
      // Deferred: refetching calls supabase.auth.getSession(), which waits for the auth lock that
      // is still held while this callback runs (supabase-js deadlock pitfall).
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }), 0);
    }
  });
  return () => data.subscription.unsubscribe();
}

const NOT_CONFIGURED = "Akun belum bisa dipakai di sini (Supabase Auth belum dikonfigurasi).";

/** Supabase Auth error codes → message for the user. */
export function authErrorMessage(err: unknown, fallback = "Terjadi kesalahan. Coba lagi."): string {
  const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
  switch (code) {
    case "invalid_credentials":
      return "Email atau kata sandi salah.";
    case "email_not_confirmed":
      return "Email belum dikonfirmasi. Buka tautan di email pendaftaranmu dulu.";
    case "user_already_exists":
    case "email_exists":
      return "Email ini sudah terdaftar. Silakan masuk.";
    case "weak_password":
      return "Kata sandi terlalu lemah. Pakai minimal 8 karakter, campur huruf dan angka.";
    case "email_address_invalid":
    case "validation_failed":
      return "Alamat email tidak valid.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
    case "signup_disabled":
      return "Pendaftaran akun sedang ditutup.";
    default:
      return fallback;
  }
}

export async function signIn(queryClient: QueryClient, email: string, password: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error(NOT_CONFIGURED);
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  // A practice session from before signing in may belong to someone else on this device.
  useSessionStore.getState().setSessionId(null);
  queryClient.removeQueries({ queryKey: ["session"] });
  queryClient.removeQueries({ queryKey: ["progress"] });
  await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
}

/** Returns `needsConfirmation` when Supabase requires the email link before the first sign-in. */
export async function signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
  const sb = getSupabase();
  if (!sb) throw new Error(NOT_CONFIGURED);
  const { data, error } = await sb.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: `${window.location.origin}/masuk` },
  });
  if (error) throw error;
  // Supabase hides "already registered" behind a user without identities (no email is sent).
  if (data.user && data.user.identities?.length === 0) throw { code: "user_already_exists" };
  return { needsConfirmation: !data.session };
}

export async function signOut(queryClient: QueryClient): Promise<void> {
  await api.logout().catch(() => undefined); // forget the practice-session cookie in this browser
  await getSupabase()?.auth.signOut().catch(() => undefined);
  useSessionStore.getState().setSessionId(null);
  queryClient.removeQueries({ queryKey: ["session"] });
  queryClient.removeQueries({ queryKey: ["progress"] });
  queryClient.removeQueries({ queryKey: ["admin"] });
  queryClient.setQueryData(ME_QUERY_KEY, null);
}

/** Only same-site paths, so `?next=` cannot send people to another site after signing in. */
export function safeNext(next: string | null | undefined, fallback = "/galeri"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
