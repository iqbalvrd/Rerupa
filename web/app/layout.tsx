import type { Metadata, Viewport } from "next";
import { Alegreya_Sans, Marcellus } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

// Museum typography (OFL, Google Fonts). Headings: Marcellus, a carved
// inscription capital like a museum wall plaque. Text: Alegreya Sans, a
// humanist sans with calligraphic roots that stays readable in small UI copy.
// next/font self-hosts them and generates metric-matched fallbacks.
const sans = Alegreya_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const display = Marcellus({
  variable: "--font-display",
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
