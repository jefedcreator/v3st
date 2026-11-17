import "@/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { env } from "@/env";

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: "V3ST — Start with naira. See investing clearly.",
  description:
    "An illustrative beta preview of naira funding, fractional tokenized stock exposure, optional strategies and eligible proceeds. Test funds only. No account required.",
  robots: { index: false, follow: false },
  icons: [{ rel: "icon", url: "/icon.svg", type: "image/svg+xml" }],
  openGraph: {
    title: "V3ST — Start with naira. See investing clearly.",
    description:
      "Explore an illustrative beta preview. No account required. Test funds only.",
    type: "website",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "V3ST: Start with naira. See investing clearly. Illustrative beta preview, test funds only.",
      },
    ],
  },
  twitter: { card: "summary_large_image", images: ["/opengraph-image.png"] },
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>{children}</body>
    </html>
  );
}
