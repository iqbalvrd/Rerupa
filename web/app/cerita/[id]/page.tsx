import type { Metadata } from "next";
import { Suspense } from "react";
import { StoryView } from "@/components/story/story-view";

export const metadata: Metadata = {
  title: "Kisah di balik karya",
  description: "Kisah karya dalam beberapa panel, dengan label sumber dan tautan fakta.",
};

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    // useSearchParams needs a Suspense boundary for static rendering.
    <Suspense>
      <StoryView id={id} />
    </Suspense>
  );
}
