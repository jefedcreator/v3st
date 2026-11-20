import type { ReactNode } from "react";

import { AppProviders } from "@/components/app/app-providers";

// Sign-in sits in a centred column with no navigation, under a faint, static
// wash of the landing's signal green: the threshold between the two worlds.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders session={null} live={false}>
      <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(80%_50%_at_50%_0%,rgb(0_128_77/0.16),transparent_72%)] px-4 py-10">
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </AppProviders>
  );
}
