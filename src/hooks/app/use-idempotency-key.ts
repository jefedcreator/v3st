"use client";

import * as React from "react";

import { nextIdempotencyKey } from "./idempotency";

// One money job's Idempotency-Key. `renew` is the "new preview" (or "done")
// transition of `nextIdempotencyKey`; a retry keeps `key` as it is, so a
// dropped response retried with the same review never moves money twice.
export function useIdempotencyKey(): { key: string; renew: () => void } {
  const [key, setKey] = React.useState(() => makeIdempotencyKey());
  const renew = React.useCallback(() => {
    setKey((current) => nextIdempotencyKey(current, "new_preview", makeIdempotencyKey));
  }, []);
  return { key, renew };
}

export function makeIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
