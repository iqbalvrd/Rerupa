import { ArtworkDetailView } from "@/components/artwork/artwork-detail";

/** /karya/[slug] opened from the gallery wall: shown on top of the still-mounted gallery. */
export default async function ArtworkOverlay({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ArtworkDetailView slug={slug} overlay />;
}
