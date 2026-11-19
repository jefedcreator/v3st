import type { ReactNode } from "react";

import { AppProviders } from "@/components/app/app-providers";

// Sign-in sits in a centred column with no navigation.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders session={null} live={false}>
      <div className="flex min-h-dvh items-center justify-center px-4 py-10">
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </AppProviders>
  );
}
