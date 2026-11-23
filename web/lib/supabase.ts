/**
 * Supabase Auth client (email + password) — used for accounts only, never for data.
 *
 * The session (access + refresh token) is kept in localStorage by supabase-js, not in a
 * cookie: the API lives on another site, and Safari iOS blocks cross-site cookies. Every API
 * call sends the access token as `Authorization: Bearer …`; the API verifies it with Supabase
 * and reads the role from its own `profiles` table.
 *
 * NEXT_PUBLIC_SUPABASE_ANON_KEY is the public (publishable/anon) key: it can only reach Auth,
 * since the database denies the anon/authenticated roles everything.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const AUTH_CONFIGURED = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/** Browser-only singleton; null when auth is not configured (or during server rendering). */
export function getSupabase(): SupabaseClient | null {
  if (!AUTH_CONFIGURED || typeof window === "undefined") return null;
  client ??= createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "rerupa-auth" },
  });
  return client;
}

/** Current access token (refreshed by supabase-js when close to expiry), or null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
