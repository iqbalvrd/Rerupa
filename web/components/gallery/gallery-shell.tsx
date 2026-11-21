"use client";

import { usePathname } from "next/navigation";

/**
 * While an artwork is open on top of the gallery, the gallery underneath is
 * made inert: not focusable, not read by screen readers, not clickable.
 */
export function GalleryShell({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  const artworkOpen = usePathname().startsWith("/karya/");
  return (
    <>
      <div inert={artworkOpen}>
        {children}
      </div>
      {modal}
    </>
  );
}
