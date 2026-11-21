import type { Metadata } from "next";
import { MuseumGallery } from "@/components/gallery/museum-gallery";

export const metadata: Metadata = {
  title: "Galeri",
  description: "Pilih karya dari koleksi untuk dilukis ulang tahap demi tahap, atau foto lukisanmu sendiri.",
};

export default function GalleryPage() {
  return (
    <main>
      <h1 className="sr-only">Galeri Rerupa</h1>
      <MuseumGallery />
    </main>
  );
}
