import { expect, it } from "vitest";
import { nextBackoffMs, parseChangedFrame } from "@/hooks/app/use-app-events";
import { nextIdempotencyKey } from "@/hooks/app/idempotency";

it("backs off from 1s to 30s and parses frames", () => {
  expect([0, 1, 2, 5, 9].map(nextBackoffMs)).toEqual([1000, 2000, 4000, 30000, 30000]);
  expect(parseChangedFrame('{"areas":["home","cash"]}')).toEqual(["home", "cash"]);
  expect(parseChangedFrame("not json")).toEqual([]);
});

it("keeps the key for retries and renews it for a new preview", () => {
  const make = () => "k2";
  expect(nextIdempotencyKey("k1", "retry", make)).toBe("k1");
  expect(nextIdempotencyKey("k1", "new_preview", make)).toBe("k2");
  expect(nextIdempotencyKey("k1", "done", make)).toBe("k2");
});
