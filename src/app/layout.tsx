import "@/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { env } from "@/env";

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: "V3ST — Start with naira. See investing clearly.",
  description:
    "An illustrative beta preview of V3ST: explore a local demo of naira funding, fractional tokenized stock exposure, optional income strategies and eligible proceeds paid to a bank. Test funds only — no account required.",
  robots: { index: false, follow: false },
  icons: [{ rel: "icon", url: "/icon.svg", type: "image/svg+xml" }],
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
