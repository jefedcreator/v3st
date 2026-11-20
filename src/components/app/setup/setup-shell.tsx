"use client";

import type { ReactNode } from "react";

import { ProductLogo } from "@/components/product-logo";
import { useSignOut } from "@/components/app/signin/use-sign-out";
import { Badge, Button } from "@/primitives";

// The setup shell: grain, Beta and Sign out, with no tab bar, under the
// same faint wash as sign-in.
export function SetupShell({ children }: { children: ReactNode }) {
  const { signOut } = useSignOut();
  return (
    <div className="min-h-dvh bg-[radial-gradient(80%_40%_at_50%_0%,rgb(0_128_77/0.12),transparent_72%)]">
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ProductLogo className="h-7 w-auto text-gain" />
            <Badge>Beta</Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
        <div className="flex flex-1 flex-col py-8">{children}</div>
      </div>
    </div>
  );
}
