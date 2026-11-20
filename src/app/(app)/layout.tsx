import type { ReactNode } from "react";

import { AppProviders } from "@/components/app/app-providers";
import { AppChrome } from "@/components/app/chrome/app-chrome";
import { getCurrentCustomer } from "@/server/app/session";
import { readSession } from "@/server/app/reads";

// The chrome mounts once here; pages do their own requireCustomer.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentCustomer();
  const session = user !== null ? await readSession(user) : null;
  return (
    <AppProviders session={session} live>
      <AppChrome>{children}</AppChrome>
    </AppProviders>
  );
}
