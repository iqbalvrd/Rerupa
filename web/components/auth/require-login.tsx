"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

/**
 * Practice pages (persiapan, latihan, checkpoint, unggah, selesai) need an account.
 * Guests see why and a way to sign in that brings them back here. The API enforces the same
 * rule (`login_required`); this only saves a failed request.
 */
export function RequireLogin({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <Gate>{children}</Gate>
    </Suspense>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const pathname = usePathname();
  const params = useSearchParams();

  if (auth.status === "signedIn") return <>{children}</>;
  if (auth.status === "loading") {
    return (
      <p className="text-muted-foreground px-safe py-16 text-center text-sm" role="status">
        Memeriksa akun…
      </p>
    );
  }

  const query = params.toString();
  const next = encodeURIComponent(pathname + (query ? `?${query}` : ""));
  return (
    <section className="px-safe mx-auto flex min-h-dvh max-w-sm flex-col justify-center py-16">
      <h1 className="font-heading text-2xl">Masuk untuk latihan</h1>
      <p className="text-muted-foreground mt-3">
        Galeri dan tutorial bisa dilihat tanpa akun. Untuk mulai latihan, mengunggah foto, dan mendapat masukan, masuk atau
        buat akun dulu.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <Button asChild className="h-11 text-base">
          <Link href={`/masuk?next=${next}`}>Masuk</Link>
        </Button>
        <Button asChild variant="outline" className="h-11 text-base">
          <Link href={`/daftar?next=${next}`}>Buat akun</Link>
        </Button>
        <Button asChild variant="ghost" className="h-11">
          <Link href="/galeri">Kembali ke galeri</Link>
        </Button>
      </div>
    </section>
  );
}
