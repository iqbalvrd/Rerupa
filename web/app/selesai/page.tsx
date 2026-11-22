import type { Metadata } from "next";
import { FinishView } from "@/components/finish/finish-view";

export const metadata: Metadata = {
  title: "Selesai",
  description: "Rangkuman latihan, refleksi budaya, dan latihan berikutnya.",
};

export default function FinishPage() {
  return <FinishView />;
}
