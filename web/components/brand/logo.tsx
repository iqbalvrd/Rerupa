import Image from "next/image";

/**
 * Rerupa wordmark (navy lettering, gold brush on the "a").
 * Source: Logo_Rerupa_Minimalis_dengan_Aksen_Kuas_Emas (team upload), trimmed to its ink.
 * Size it by height; the width follows the 695 x 210 aspect ratio.
 */
export function Logo({ className = "h-7 w-auto", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/rerupa-logo.webp"
      alt="Rerupa"
      width={695}
      height={210}
      className={className}
      priority={priority}
      unoptimized
    />
  );
}
