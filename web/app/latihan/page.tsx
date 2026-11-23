import type { Metadata } from "next";
import { RequireLogin } from "@/components/auth/require-login";
import { Suspense } from "react";
import { PracticeView } from "@/components/practice/practice-view";

export const metadata: Metadata = {
  title: "Ruang latihan",
  description: "Ikuti tahapan melukis dari sketsa sampai detail.",
};

export default function PracticePage() {
  return (
    // useSearchParams needs a Suspense boundary for static rendering.
    <Suspense>
      <RequireLogin>
        <PracticeView />
      </RequireLogin>
    </Suspense>
  );
}
