import type { Metadata } from "next";
import { RequireLogin } from "@/components/auth/require-login";
import { FinishView } from "@/components/finish/finish-view";

export const metadata: Metadata = {
  title: "Selesai",
  description: "Rangkuman latihan, refleksi budaya, dan latihan berikutnya.",
};

export default function FinishPage() {
  return (
    <RequireLogin>
      <FinishView />
    </RequireLogin>
  );
}
