import { describe, expect, it } from "vitest";

import type { Stock } from "@/server/prisma";
import {
  referenceDisplay,
  referenceUsable,
  sharePriceMicroUsd,
  tokenPriceMicroUsd,
} from "@/backend/services/stocks/reference";

function stockAt(chain: string, ageSeconds: number, overrides: Partial<Stock> = {}): Stock {
  const asOf = new Date(Date.now() - ageSeconds * 1_000);
  return {
    chain,
    referencePriceMicroUsd: 250_000_000n,
    referenceBasis: "token_nav",
    referenceAsOf: asOf,
    multiplierWad: "1000000000000000000",
    decimals: 18,
    ...overrides,
  } as unknown as Stock;
}

describe("reference windows", () => {
  it("uses the per-network trading window", () => {
    expect(referenceUsable(stockAt("basesepolia", 7_199), new Date())).toBe(true);
    expect(referenceUsable(stockAt("basesepolia", 7_201), new Date())).toBe(false);
    expect(referenceUsable(stockAt("testnet", 59), new Date())).toBe(true);
    expect(referenceUsable(stockAt("testnet", 61), new Date())).toBe(false);
    expect(referenceUsable(stockAt("base", 61), new Date())).toBe(false);
  });

  it("marks display prices live, delayed or missing", () => {
    const now = new Date();
    expect(referenceDisplay(stockAt("testnet", 10), now)?.status).toBe("live");
    const threeDays = referenceDisplay(stockAt("basesepolia", 3 * 86_400), now);
    expect(threeDays?.status).toBe("delayed");
    expect(threeDays?.asOf).toEqual(stockAt("basesepolia", 3 * 86_400).referenceAsOf);
    expect(referenceDisplay(stockAt("basesepolia", 8 * 86_400), now)).toBeNull();
    expect(referenceDisplay(stockAt("basesepolia", 10, { referencePriceMicroUsd: null }), now)).toBeNull();
  });

  it("converts between token NAV and share price with the multiplier", () => {
    const nav = { referencePriceMicroUsd: 100_000_000n, referenceBasis: "token_nav", multiplierWad: "1500000000000000000" } as unknown as Stock;
    expect(tokenPriceMicroUsd(nav)).toBe(100_000_000n);
    const share = { referencePriceMicroUsd: 100_000_000n, referenceBasis: "share_price", multiplierWad: "1500000000000000000" } as unknown as Stock;
    expect(tokenPriceMicroUsd(share)).toBe(150_000_000n);
    expect(sharePriceMicroUsd(share)).toBe(100_000_000n);
    const unpriced = { referencePriceMicroUsd: null, referenceBasis: null, multiplierWad: "1000000000000000000" } as unknown as Stock;
    expect(tokenPriceMicroUsd(unpriced)).toBeNull();
  });
});
