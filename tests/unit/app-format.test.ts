import { describe, expect, it } from "vitest";

import {
  customerReference,
  firstNameOf,
  formatNaira,
  formatShares,
  sharesMicroOf,
  toKobo,
} from "@/backend/services/app/format";
import { redact } from "@/utils";

describe("customer formatting", () => {
  it("formats naira from kobo", () => {
    expect(formatNaira(2_000_000n)).toBe("₦20,000");
    expect(formatNaira(2_000_050n)).toBe("₦20,000.50");
    expect(formatNaira(-150n)).toBe("-₦1.50");
    expect(formatNaira(0n)).toBe("₦0");
  });

  it("formats shares from millionths with at most 4 decimals", () => {
    expect(formatShares(42_100n)).toBe("0.0421 shares");
    expect(formatShares(1_000_000n)).toBe("1 share");
    expect(formatShares(2_500_000n)).toBe("2.5 shares");
    expect(formatShares(0n)).toBe("0 shares");
  });

  it("builds stable support references", () => {
    expect(customerReference("ck123")).toMatch(/^V3-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(customerReference("ck123")).toBe(customerReference("ck123"));
    expect(customerReference("ck124")).not.toBe(customerReference("ck123"));
  });

  it("derives first names from verified names", () => {
    expect(firstNameOf("ADAEZE OBI")).toBe("Adaeze");
    expect(firstNameOf(null)).toBeNull();
  });

  it("converts micro-USD to kobo and raw units to share millionths", () => {
    expect(toKobo(1_000_000n, { kobo: 1_600_000n, microUsd: 1_000_000n })).toBe(1_600_000n);
    expect(toKobo(1_500_000n, { kobo: 1_600_000n, microUsd: 1_000_000n })).toBe(2_400_000n);
    expect(toKobo(999_999n, { kobo: 1_600_000n, microUsd: 1_000_000n })).toBe(1_599_998n);
    expect(sharesMicroOf(1_500_000_000_000_000_000n, 18)).toBe(1_500_000n);
    expect(sharesMicroOf(1n, 18)).toBe(0n);
    expect(sharesMicroOf(1_234_567n, 6)).toBe(1_234_567n);
  });

  it("redacts PIN and token fields", () => {
    expect(
      redact({ pin: "1357", current_pin: "2468", access_token: "a", identity_token: "b" }),
    ).toEqual({
      pin: "[redacted]",
      current_pin: "[redacted]",
      access_token: "[redacted]",
      identity_token: "[redacted]",
    });
  });
});
