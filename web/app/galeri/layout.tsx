import { GalleryShell } from "@/components/gallery/gallery-shell";

/**
 * The gallery stays mounted while an artwork is open: opening a frame from the
 * wall renders the artwork page in the `modal` slot on top (intercepted
 * /karya/[slug]), so the 3D room never reloads and going back is instant.
 * Visiting /karya/[slug] directly still renders the full page.
 */
export default function GalleryLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return <GalleryShell modal={modal}>{children}</GalleryShell>;
}
