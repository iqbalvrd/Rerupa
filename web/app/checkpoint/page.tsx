import type { Metadata } from "next";
import { RequireLogin } from "@/components/auth/require-login";
import { Suspense } from "react";
import { CheckpointView } from "@/components/checkpoint/checkpoint-view";

export const metadata: Metadata = {
  title: "Checkpoint",
  description: "Foto hasil latihanmu dan dapatkan saran dari panduan tahap ini.",
};

export default function CheckpointPage() {
  return (
    // useSearchParams needs a Suspense boundary for static rendering.
    <Suspense>
      <RequireLogin>
        <CheckpointView />
      </RequireLogin>
    </Suspense>
  );
}
