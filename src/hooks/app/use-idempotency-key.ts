"use client";

import * as React from "react";

export function useIdempotencyKey(): { key: string; renew: () => void } {
  const [key, setKey] = React.useState(() => makeIdempotencyKey());
  const renew = React.useCallback(() => {
    setKey(makeIdempotencyKey());
  }, []);
  return { key, renew };
}

export function makeIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
