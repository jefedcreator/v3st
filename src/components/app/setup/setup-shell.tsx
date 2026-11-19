"use client";

import type { ReactNode } from "react";

import { Wordmark } from "@/components/landing/wordmark";
import { useSignOut } from "@/components/app/signin/use-sign-out";
import { Badge, Button } from "@/primitives";

// The setup shell: wordmark, Beta and Sign out, with no tab bar.
export function SetupShell({ children }: { children: ReactNode }) {
  const { signOut } = useSignOut();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Wordmark className="h-4" />
          <Badge>Beta</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
      <div className="flex flex-1 flex-col py-8">{children}</div>
    </div>
  );
}
