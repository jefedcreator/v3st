import { describe, expect, it } from "vitest";

import type { Stock } from "@/server/prisma";
import { assertVenueWithinBand } from "@/backend/services/stocks/reference";

const stock = {
  chain: "basesepolia",
  decimals: 18,
  referencePriceMicroUsd: 250_000_000n,
  referenceBasis: "token_nav",
  referenceAsOf: new Date(),
  multiplierWad: "1000000000000000000",
} as unknown as Stock;

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
      assertVenueWithinBand({ ...stock, chain: "testnet" } as Stock, "buy", 1_000_000_000n, 1n),
    ).not.toThrow();
  });

  it("refuses when there is no reference price", () => {
    const unpriced = { ...stock, referencePriceMicroUsd: null } as unknown as Stock;
    expect(() => assertVenueWithinBand(unpriced, "buy", 1_000_000_000n, 3_900_000_000_000_000_000n)).toThrow(
      expect.objectContaining({ code: "REFERENCE_STALE" }),
    );
  });
});
