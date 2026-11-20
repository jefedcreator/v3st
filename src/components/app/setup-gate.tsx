import Link from "next/link";
import type { ReactNode } from "react";

import { useOnboardingComplete } from "@/components/app/app-providers";
import { Button } from "@/primitives";

// Money actions need a finished setup; an unfinished one routes to /setup.
export function SetupGate({ children, label }: { children: ReactNode; label?: string }) {
  const complete = useOnboardingComplete();
  if (complete) return <>{children}</>;
  return (
    <Button variant="outline" asChild>
      <Link href="/setup">{label ?? "Finish setting up"}</Link>
    </Button>
  );
}
