import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Yeseva_One } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

// Fonts from LANDING_SPEC.md §7 (OFL). next/font self-hosts them and generates
// metric-matched fallbacks, so the swap does not shift layout.
const sans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const display = Yeseva_One({
  variable: "--font-yeseva",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Rerupa",
    template: "%s · Rerupa",
  },
  description: "Mentor melukis seni Nusantara. Ikuti karya tahap demi tahap, dari sketsa sampai detail.",
  // Opt into OS-level text scaling (Dynamic Type / Android font size) where supported.
  other: { "text-scale": "scale" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw edge to edge; fixed bars pad themselves with env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
