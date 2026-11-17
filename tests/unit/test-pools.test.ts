import { describe, expect, it } from "vitest";
import type { Address } from "viem";

import type { NetworkManifest } from "@/backend/services/onchain/manifests";
import type { PoolState } from "@/backend/services/onchain/providers/hydrex/pool";
import {
  assertKeeperSwap,
  planAlignment,
  poolMidPriceMicroUsd,
  targetSqrtPriceX96,
} from "@/backend/services/stocks/test-pools";

const STOCK = "0x00000000000000000000000000000000000000aa" as Address;
const USDC = "0x00000000000000000000000000000000000000bb" as Address;
const POOL = "0x00000000000000000000000000000000000000cc" as Address;
const ROUTER = "0x00000000000000000000000000000000000000dd" as Address;
const KEEPER = "0x00000000000000000000000000000000000000ee" as Address;

function stateWith(sqrtPriceX96: bigint, stockIsToken0: boolean): PoolState {
  return {
    address: POOL,
    token0: stockIsToken0 ? STOCK : USDC,
    token1: stockIsToken0 ? USDC : STOCK,
    sqrtPriceX96,
    tick: 0,
    feePips: 3_000,
    liquidity: 10n ** 24n,
    tickSpacing: 60,
  };
}

const manifest = {
  external: {
    HydrexSwapRouter: { address: ROUTER, codeHash: "0xabc" },
    HydrexPool_X: { address: POOL, codeHash: "0xdef" },
  },
} as unknown as NetworkManifest;

describe("test pool alignment", () => {
  it("round-trips mid price and target for both token orders", () => {
    for (const stockIsToken0 of [true, false]) {
      const sqrt = targetSqrtPriceX96(250_000_000n, stockIsToken0, 18);
      const mid = poolMidPriceMicroUsd(stateWith(sqrt, stockIsToken0), STOCK, 18).midMicroUsd;
      expect(mid > 249_999_998n && mid < 250_000_002n).toBe(true);
    }
  });

  it("plans nothing inside 50 bps and caps each side", () => {
    expect(
      planAlignment({
        midMicroUsd: 250_100_000n,
        refMicroUsd: 250_000_000n,
        stockIsToken0: true,
        decimals: 18,
        keeperUsdc: 10n ** 13n,
        keeperStock: 10n ** 21n,
      }),
    ).toBeNull();
    expect(
      planAlignment({
        midMicroUsd: 237_500_000n,
        refMicroUsd: 250_000_000n,
        stockIsToken0: true,
        decimals: 18,
        keeperUsdc: 10n ** 13n,
        keeperStock: 10n ** 21n,
      }),
    ).toMatchObject({ tokenIn: "usdc", amountIn: 5_000_000_000n });
    expect(
      planAlignment({
        midMicroUsd: 262_500_000n,
        refMicroUsd: 250_000_000n,
        stockIsToken0: true,
        decimals: 18,
        keeperUsdc: 10n ** 13n,
        keeperStock: 10n ** 21n,
      }),
    ).toMatchObject({ tokenIn: "stock", amountIn: 20n * 10n ** 18n });
    expect(
      planAlignment({
        midMicroUsd: 237_500_000n,
        refMicroUsd: 250_000_000n,
        stockIsToken0: true,
        decimals: 18,
        keeperUsdc: 0n,
        keeperStock: 0n,
      }),
    ).toBeNull();
  });

  it("refuses swaps outside the manifest or to anyone but the keeper", () => {
    const base = { chainId: 84532, router: ROUTER, pool: POOL, recipient: KEEPER, tokenIn: USDC, tokenOut: STOCK };
    expect(() => assertKeeperSwap(base, manifest, KEEPER)).not.toThrow();
    expect(() => assertKeeperSwap({ ...base, chainId: 31337 }, manifest, KEEPER)).toThrow();
    expect(() =>
      assertKeeperSwap({ ...base, router: STOCK }, manifest, KEEPER),
    ).toThrow();
    expect(() =>
      assertKeeperSwap({ ...base, pool: USDC }, manifest, KEEPER),
    ).toThrow();
    expect(() =>
      assertKeeperSwap({ ...base, recipient: STOCK }, manifest, KEEPER),
    ).toThrow();
  });
});
