import type { ReactNode } from "react";

import { AppProviders } from "@/components/app/app-providers";
import { SetupShell } from "@/components/app/setup/setup-shell";

export default function SetupLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders session={null} live={false}>
      <SetupShell>{children}</SetupShell>
    </AppProviders>
  );
}
