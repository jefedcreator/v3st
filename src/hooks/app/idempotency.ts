// The idempotency key's life: created when a review opens, kept for every
// retry of that review, replaced for a new preview, replaced once done.
export function nextIdempotencyKey(
  current: string,
  event: "retry" | "new_preview" | "done",
  make: () => string,
): string {
  if (event === "retry") return current;
  return make();
}
