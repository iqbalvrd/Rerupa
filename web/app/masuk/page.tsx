import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Masuk",
  description: "Masuk ke akun Rerupa untuk mulai latihan melukis.",
};

export default function SignInPage() {
  return (
    <AppShell>
      {/* useSearchParams needs a Suspense boundary for static rendering. */}
      <Suspense>
        <AuthForm mode="masuk" />
      </Suspense>
    </AppShell>
  );
}
