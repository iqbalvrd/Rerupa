import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Daftar",
  description: "Buat akun Rerupa untuk latihan melukis dan mengunggah foto karyamu.",
};

export default function SignUpPage() {
  return (
    <AppShell>
      {/* useSearchParams needs a Suspense boundary for static rendering. */}
      <Suspense>
        <AuthForm mode="daftar" />
      </Suspense>
    </AppShell>
  );
}
