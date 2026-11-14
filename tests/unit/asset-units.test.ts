import { describe, expect, it } from "vitest";

import {
  RAW_MAX,
  assertRaw,
  fromDbRaw,
  parseRaw,
  toDbRaw,
} from "@/utils/asset-units";

describe("asset-units", () => {
  it("roundTrips18DecimalInventory: an 18-decimal raw quantity survives the database boundary exactly", () => {
    const raw = 100n * 10n ** 18n;
    expect(fromDbRaw(toDbRaw(raw))).toBe(100n * 10n ** 18n);
    expect(fromDbRaw(toDbRaw(RAW_MAX))).toBe(RAW_MAX);
    expect(fromDbRaw(toDbRaw(0n))).toBe(0n);
  });

  it("parseRaw accepts canonical integer strings up to 2^256-1", () => {
    expect(parseRaw("0")).toBe(0n);
    expect(parseRaw("1000000000000000000")).toBe(10n ** 18n);
    expect(parseRaw(RAW_MAX.toString())).toBe(RAW_MAX);
  });

  it("rejects 2^256, fractional values, negatives and non-canonical strings", () => {
    expect(() => parseRaw((2n ** 256n).toString())).toThrow(/2\^256-1/);
    expect(() => parseRaw("1.5")).toThrow();
    expect(() => parseRaw("-1")).toThrow();
    expect(() => parseRaw("01")).toThrow();
    expect(() => parseRaw("")).toThrow();
    expect(() => parseRaw(" 1")).toThrow();
    expect(() => assertRaw(-1n)).toThrow();
    expect(() => assertRaw(2n ** 256n)).toThrow();
    expect(() => toDbRaw(10n ** 30n * 10n ** 30n)).toThrow();
  });
});
