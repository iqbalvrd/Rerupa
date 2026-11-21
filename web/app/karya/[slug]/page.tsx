import { ArtworkDetailView } from "@/components/artwork/artwork-detail";

export default async function ArtworkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ArtworkDetailView slug={slug} />;
}
