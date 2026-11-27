"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState, type FormEvent } from "react";
import { authErrorMessage, safeNext, signIn, signUp, useAuth } from "@/lib/auth";
import { Logo } from "@/components/brand/logo";
import { AUTH_CONFIGURED } from "@/lib/supabase";
import { AuthBackdrop, OrnateCard } from "./auth-backdrop";
import styles from "./auth.module.css";

const MIN_PASSWORD = 8;

/**
 * Sign-in (`/masuk`) and sign-up (`/daftar`): a Raden Saleh landscape on one half, the form on a
 * kawung-batik wall on the other (stacked on phones). `?next=` brings the learner back where they were.
 */
export function AuthForm({ mode }: { mode: "masuk" | "daftar" }) {
  return (
    <div className={styles.root}>
      <ArtPanel />
      <div className={styles.formSide}>
        <AuthBackdrop />
        <OrnateCard>
          <FormBody mode={mode} />
        </OrnateCard>
      </div>
    </div>
  );
}

/** Public-domain painting (public/auth/ASSETS_LICENSE.txt) with a museum-style label. */
function ArtPanel() {
  return (
    <figure className={styles.art}>
      <Image
        src="/auth/raden-saleh-kampung-1863.webp"
        alt="Lukisan pemandangan Jawa: rumah beratap ilalang di bawah pohon besar, warga di halaman, lembah dan gunung di kejauhan."
        fill
        priority
        sizes="(min-width: 1024px) 50vw, 100vw"
        className={styles.artImage}
      />
      <Link href="/" className={styles.artHome} aria-label="Rerupa, ke beranda">
        <Logo className="h-6 w-auto" priority />
      </Link>
      <figcaption className={styles.artLabel}>
        <span className={styles.artTitle}>Bentang Alam Indonesia dengan Kampung</span>
        <span>Raden Saleh, 1863 · domain publik</span>
      </figcaption>
    </figure>
  );
}

function Divider() {
  return (
    <div className={styles.divider} aria-hidden="true">
      <span className={styles.diamond} />
    </div>
  );
}

function FormBody({ mode }: { mode: "masuk" | "daftar" }) {
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
      <section aria-live="polite">
        <h1 className={styles.title}>Cek emailmu</h1>
        <Divider />
        <p className={styles.lead}>
          Kami mengirim tautan konfirmasi ke <strong className="text-(--ink)">{sentTo}</strong>. Buka tautan itu, lalu
          masuk dengan email dan kata sandimu.
        </p>
        <Link href={`/masuk${nextQuery}`} className={`${styles.submit} mt-6 flex w-full items-center justify-center`}>
          Ke halaman masuk
        </Link>
      </section>
    );
  }

  const title = mode === "masuk" ? "Masuk" : "Buat akun";
  const invalid = error ? true : undefined;
  const describedBy = error ? ids.error : undefined;

  return (
    <section>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.lead}>
        {mode === "masuk"
          ? "Masuk untuk mulai latihan, mengunggah foto, dan menyimpan progresmu."
          : "Galeri dan tutorial bisa dilihat tanpa akun. Akun dibutuhkan untuk latihan dan unggah foto."}
      </p>
      <Divider />

      {!AUTH_CONFIGURED && (
        <p className={styles.note} role="status">
          Akun belum aktif di lingkungan ini (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY kosong).
        </p>
      )}

      <form className="mt-4 flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.email} className={styles.label}>
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
            className={styles.input}
            aria-invalid={invalid}
            aria-describedby={describedBy}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.password} className={styles.label}>
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
            className={styles.input}
            aria-invalid={invalid}
            aria-describedby={describedBy}
          />
        </div>
        {mode === "daftar" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.confirm} className={styles.label}>
              Ulangi kata sandi
            </label>
            <input
              id={ids.confirm}
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={styles.input}
            />
          </div>
        )}

        {error && (
          <p id={ids.error} className={styles.error} role="alert">
            {error}
          </p>
        )}

        <button type="submit" className={`${styles.submit} mt-1 w-full`} disabled={busy || !AUTH_CONFIGURED}>
          {busy ? "Sebentar…" : title}
        </button>
      </form>

      <p className={styles.footer}>
        {mode === "masuk" ? (
          <>
            Belum punya akun?{" "}
            <Link href={`/daftar${nextQuery}`} className={styles.link}>
              Daftar
            </Link>
          </>
        ) : (
          <>
            Sudah punya akun?{" "}
            <Link href={`/masuk${nextQuery}`} className={styles.link}>
              Masuk
            </Link>
          </>
        )}
      </p>
    </section>
  );
}
