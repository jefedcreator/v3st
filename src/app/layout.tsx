import "@/styles/globals.css";

import { type Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { env } from "@/env";

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: "V3ST · Invest. Earn. Harvest.",
  description:
    "Invest in Apple, NVIDIA and other US companies with naira, from ₦1,000. Join the V3ST beta waitlist. Test money only during the beta.",
  robots: { index: false, follow: false },
  icons: [{ rel: "icon", url: "/icon.svg", type: "image/svg+xml" }],
};

const bricolage = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  variable: "--font-bricolage",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={bricolage.variable}>
      <body className="bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
