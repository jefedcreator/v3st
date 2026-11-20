"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/primitives";

// The page body for a failed read. Inside an error boundary, `reset` clears
// the boundary while the refresh re-runs the server reads.
export function AppError({ line, reset }: { line?: string; reset?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <div className="flex flex-col items-start gap-3 py-16" role="alert">
      <p className="text-ink text-base">{line ?? "We couldn't load this page."}</p>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            router.refresh();
            if (reset !== undefined) reset();
          })
        }
      >
        Try again
      </Button>
    </div>
  );
}
