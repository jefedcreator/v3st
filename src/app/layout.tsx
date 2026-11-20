import "@/styles/globals.css";

import { type Metadata } from "next";
import { Archivo } from "next/font/google";
import { env } from "@/env";

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: "V3ST · Invest. Earn. Harvest.",
  description:
    "Invest in Apple, NVIDIA and other US companies with naira, from ₦1,000. Join the V3ST beta waitlist. Test money only during the beta.",
  robots: { index: false, follow: false },
  icons: [{ rel: "icon", url: "/icon.svg", type: "image/svg+xml" }],
  openGraph: {
    title: "V3ST · Invest. Earn. Harvest.",
    description:
      "Invest in Apple, NVIDIA and other US companies with naira, from ₦1,000. Join the V3ST beta waitlist. Test money only during the beta.",
    type: "website",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "V3ST: Invest. Earn. Harvest. Beta, test money only.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: [
      {
        url: "/opengraph-image.png",
        alt: "V3ST: Invest. Earn. Harvest. Beta, test money only.",
      },
    ],
  },
};

// Archivo is V3ST's face from 2026-11-20 (Bricolage Grotesque is the sibling
// product Sara's). latin-ext carries the naira sign, U+20A6.
const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  variable: "--font-archivo",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
