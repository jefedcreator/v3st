import { describe, expect, it } from "vitest";

import type { PoolState } from "@/backend/services/onchain/providers/hydrex/pool";
import { fullRangeTicks, quoteExactIn, sqrtPriceX96For } from "@/backend/services/onchain/providers/hydrex/pool";

const state: PoolState = {
  address: "0x00000000000000000000000000000000000000aa",
  token0: "0x0000000000000000000000000000000000000001",
  token1: "0x0000000000000000000000000000000000000002",
  sqrtPriceX96: 2n ** 96n,
  tick: 0,
  feePips: 3000,
  liquidity: 1_000_000_000n,
  tickSpacing: 60,
};

describe("hydrex pool math", () => {
  it("quotes constant-product output net of the pool fee", () => {
    const { amountOut } = quoteExactIn(state, state.token0, 1_000_000n);
    // x=y=1e9; in*(1-0.3%)=997000; out = 1e9*997000/(1e9+997000)
    expect(amountOut).toBe(996_006n);
  });

  it("returns ticks aligned to spacing and symmetric around zero", () => {
    const { tickLower, tickUpper } = fullRangeTicks(60);
    expect(tickLower % 60 === 0).toBe(true); // -0 === 0 for aligned negative ticks
    expect(tickUpper).toBe(-tickLower);
    expect(tickUpper).toBe(887_220);
  });

  it("rejects a token that is not in the pool", () => {
    expect(() => quoteExactIn(state, "0x0000000000000000000000000000000000000003", 1n)).toThrow();
  });

  it("computes sqrtPriceX96 for a 1:1 price as 2^96", () => {
    expect(sqrtPriceX96For(1n, 1n)).toBe(2n ** 96n);
    expect(sqrtPriceX96For(4n, 1n)).toBe(2n ** 97n);
  });
});
