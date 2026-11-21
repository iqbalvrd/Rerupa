import type { Metadata } from "next";
import { Suspense } from "react";
import { PreparationView } from "@/components/preparation/preparation-view";

export const metadata: Metadata = {
  title: "Persiapan",
  description: "Pilih ukuran bidang dan palet cat, lalu siapkan alat sebelum mulai melukis.",
};

export default function PreparationPage() {
  return (
    // useSearchParams needs a Suspense boundary for static rendering.
    <Suspense>
      <PreparationView />
    </Suspense>
  );
}
