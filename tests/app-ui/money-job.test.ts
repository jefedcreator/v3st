import { expect, it } from "vitest";

import { nextIdempotencyKey } from "@/hooks/app/idempotency";

// Review Focus 1: a retry after a dropped response reuses the key, so exactly
// one order or withdrawal results and no wrong-PIN count is used up.
it("pins the retry key", () => {
  const make = () => "k2";
  expect(nextIdempotencyKey("k1", "retry", make)).toBe("k1");
  expect(nextIdempotencyKey("k1", "new_preview", make)).toBe("k2");
  expect(nextIdempotencyKey("k1", "done", make)).toBe("k2");
});
