"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { authErrorMessage, safeNext, signIn, signUp, useAuth } from "@/lib/auth";
import { AUTH_CONFIGURED } from "@/lib/supabase";

const MIN_PASSWORD = 8;

/** Sign-in (`/masuk`) and sign-up (`/daftar`) form. `?next=` brings the learner back where they were. */
export function AuthForm({ mode }: { mode: "masuk" | "daftar" }) {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const next = safeNext(params.get("next"));
  const nextQuery = params.get("next") ? `?next=${encodeURIComponent(next)}` : "";
  const ids = { email: useId(), password: useId(), confirm: useId(), error: useId() };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Already signed in (or just confirmed the email link): go on.
  useEffect(() => {
    if (auth.status === "signedIn") router.replace(next);
  }, [auth.status, next, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (mode === "daftar") {
      if (password.length < MIN_PASSWORD) return setError(`Kata sandi minimal ${MIN_PASSWORD} karakter.`);
      if (password !== confirm) return setError("Konfirmasi kata sandi belum sama.");
    }
    setBusy(true);
    try {
      if (mode === "masuk") {
        await signIn(queryClient, email, password);
        router.replace(next);
        return;
      }
      const { needsConfirmation } = await signUp(email, password);
      if (needsConfirmation) {
        setSentTo(email.trim());
      } else {
        await signIn(queryClient, email, password);
        router.replace(next);
        return;
      }
    } catch (err) {
      setError(authErrorMessage(err, mode === "masuk" ? "Belum bisa masuk. Coba lagi." : "Belum bisa mendaftar. Coba lagi."));
    }
    setBusy(false);
  }

  if (sentTo) {
    return (
      <section className="mx-auto max-w-sm py-10" aria-live="polite">
        <h1 className="font-heading text-2xl">Cek emailmu</h1>
        <p className="text-muted-foreground mt-3">
          Kami mengirim tautan konfirmasi ke <strong className="text-foreground">{sentTo}</strong>. Buka tautan itu, lalu
          masuk dengan email dan kata sandimu.
        </p>
        <Button asChild className="mt-6 h-11 w-full">
          <Link href={`/masuk${nextQuery}`}>Ke halaman masuk</Link>
        </Button>
      </section>
    );
  }

  const title = mode === "masuk" ? "Masuk" : "Buat akun";
  const inputClass =
    "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-lg border px-3 text-base outline-none focus-visible:ring-3 aria-invalid:border-destructive";

  return (
    <section className="mx-auto max-w-sm py-10">
      <h1 className="font-heading text-2xl">{title}</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        {mode === "masuk"
          ? "Masuk untuk mulai latihan, mengunggah foto, dan menyimpan progresmu."
          : "Galeri dan tutorial bisa dilihat tanpa akun. Akun dibutuhkan untuk latihan dan unggah foto."}
      </p>

      {!AUTH_CONFIGURED && (
        <p className="bg-muted mt-4 rounded-lg p-3 text-sm" role="status">
          Akun belum aktif di lingkungan ini (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY kosong).
        </p>
      )}

      <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate={false}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.email} className="text-sm font-medium">
            Email
          </label>
          <input
            id={ids.email}
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ids.error : undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.password} className="text-sm font-medium">
            Kata sandi
          </label>
          <input
            id={ids.password}
            type="password"
            autoComplete={mode === "masuk" ? "current-password" : "new-password"}
            required
            minLength={mode === "daftar" ? MIN_PASSWORD : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ids.error : undefined}
          />
        </div>
        {mode === "daftar" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.confirm} className="text-sm font-medium">
              Ulangi kata sandi
            </label>
            <input
              id={ids.confirm}
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
          </div>
        )}

        {error && (
          <p id={ids.error} className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="h-11 w-full text-base" disabled={busy || !AUTH_CONFIGURED}>
          {busy ? "Sebentar…" : title}
        </Button>
      </form>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        {mode === "masuk" ? (
          <>
            Belum punya akun?{" "}
            <Link href={`/daftar${nextQuery}`} className="text-primary font-medium underline-offset-4 hover:underline">
              Daftar
            </Link>
          </>
        ) : (
          <>
            Sudah punya akun?{" "}
            <Link href={`/masuk${nextQuery}`} className="text-primary font-medium underline-offset-4 hover:underline">
              Masuk
            </Link>
          </>
        )}
      </p>
    </section>
  );
}
