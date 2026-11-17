import { describe, expect, it } from "vitest";

import type { Stock } from "@/server/prisma";
import { assertVenueWithinBand, worstFillSharePriceMicroUsd } from "@/backend/services/stocks/reference";

const stock = {
  chain: "basesepolia",
  decimals: 18,
  referencePriceMicroUsd: 250_000_000n,
  referenceBasis: "token_nav",
  referenceAsOf: new Date(),
  multiplierWad: "1000000000000000000",
} as unknown as Stock;

describe("worst fill price", () => {
  it("rounds against the customer on both sides", () => {
    // Buy: 1,000 USD for at least 3.9 tokens → 256.410256…, rounded up.
    expect(worstFillSharePriceMicroUsd(stock, "buy", 1_000_000_000n, 3_900_000_000_000_000_000n)).toBe(256_410_257n);
    // Sell: 4 tokens for at least 975 USD → 243.75, exact.
    expect(worstFillSharePriceMicroUsd(stock, "sell", 4_000_000_000_000_000_000n, 975_000_000n)).toBe(243_750_000n);
    expect(worstFillSharePriceMicroUsd(stock, "buy", 0n, 1n)).toBeNull();
  });
});

describe("venue band", () => {
  it("accepts quotes inside the band and refuses wider ones", () => {
    expect(() => assertVenueWithinBand(stock, "buy", 1_000_000_000n, 3_900_000_000_000_000_000n)).not.toThrow(); // 256 bps
    expect(() => assertVenueWithinBand(stock, "buy", 1_000_000_000n, 3_800_000_000_000_000_000n)).toThrow(
      expect.objectContaining({ code: "PRICE_OUT_OF_RANGE" }),
    ); // 526 bps
  });

  it("checks sells against the band too", () => {
    // Sell 4e18 stock tokens for 975_000_000 micro-USD → effective 243.75 USD per token → 250 bps, inside.
    expect(() => assertVenueWithinBand(stock, "sell", 4_000_000_000_000_000_000n, 975_000_000n)).not.toThrow();
    // 950_000_000 → 237.5 → 1000 bps, outside.
    expect(() => assertVenueWithinBand(stock, "sell", 4_000_000_000_000_000_000n, 950_000_000n)).toThrow(
      expect.objectContaining({ code: "PRICE_OUT_OF_RANGE" }),
    );
  });

  it("does not check chains without a band", () => {
    expect(() =>
      assertVenueWithinBand({ ...stock, chain: "testnet" }, "buy", 1_000_000_000n, 1n),
    ).not.toThrow();
  });

  it("refuses when there is no reference price", () => {
    const unpriced = { ...stock, referencePriceMicroUsd: null } as unknown as Stock;
    expect(() => assertVenueWithinBand(unpriced, "buy", 1_000_000_000n, 3_900_000_000_000_000_000n)).toThrow(
      expect.objectContaining({ code: "REFERENCE_STALE" }),
    );
  });
});
