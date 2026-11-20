"use client";

import * as React from "react";

import { countdown } from "@/utils/format";

// A live countdown to `expiresAt`, or null while there is nothing to count.
export function useCountdown(
  expiresAt: string | null,
): { text: string; done: boolean } | null {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    if (expiresAt === null) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (expiresAt === null) return null;
  return countdown(expiresAt, now);
}
