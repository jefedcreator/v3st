"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/primitives";

export function AppError({ line }: { line?: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-start gap-3 py-16" role="alert">
      <p className="text-body text-ink">{line ?? "We couldn't load this page."}</p>
      <Button variant="outline" onClick={() => router.refresh()}>
        Try again
      </Button>
    </div>
  );
}
