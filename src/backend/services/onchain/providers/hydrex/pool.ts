import { parseAbi, type Abi, type Address } from "viem";

import { publicClientOn } from "@/backend/services/onchain/chains";

// Read-only surface of a Hydrex (Algebra-style) pool. The shape is verified live once
// against the deployed pool (see scripts/sepolia-deploy.ts); do not guess another
// signature if globalState reverts or returns a different shape.
export const algebraPoolAbi: Abi = parseAbi([
  "function globalState() view returns (uint160 price, int24 tick, uint16 lastFee, uint8 pluginConfig, uint16 communityFee, bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function tickSpacing() view returns (int24)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

export type PoolState = {
  address: Address;
  token0: Address;
  token1: Address;
  sqrtPriceX96: bigint;
  tick: number;
  feePips: number;
  liquidity: bigint;
  tickSpacing: number;
};

let poolReaderOverride: typeof readPool | null = null;

export function __setPoolReaderForTests(fn: typeof readPool | null): void {
  poolReaderOverride = fn;
}

export async function readPoolOn(chainId: number, pool: Address): Promise<PoolState> {
  if (poolReaderOverride) return poolReaderOverride(chainId, pool);
  return readPool(chainId, pool);
}

export async function readPool(chainId: number, pool: Address): Promise<PoolState> {
  const client = publicClientOn(chainId);
  const [globalState, liquidity, tickSpacing, token0, token1] = await Promise.all([
    client.readContract({ address: pool, abi: algebraPoolAbi, functionName: "globalState" }),
    client.readContract({ address: pool, abi: algebraPoolAbi, functionName: "liquidity" }),
    client.readContract({ address: pool, abi: algebraPoolAbi, functionName: "tickSpacing" }),
    client.readContract({ address: pool, abi: algebraPoolAbi, functionName: "token0" }),
    client.readContract({ address: pool, abi: algebraPoolAbi, functionName: "token1" }),
  ]);
  return {
    address: pool,
    token0,
    token1,
    sqrtPriceX96: globalState.price,
    tick: globalState.tick,
    feePips: globalState.lastFee,
    liquidity,
    tickSpacing,
  };
}

const Q96 = 2n ** 96n;

// Constant-product quote net of the pool fee, on virtual reserves derived from the
// Algebra-style state. All division floors on bigint.
export function quoteExactIn(
  state: PoolState,
  tokenIn: Address,
  amountIn: bigint,
): { amountOut: bigint; priceImpactBps: number } {
  const tokenInLower = tokenIn.toLowerCase();
  const isToken0 = tokenInLower === state.token0.toLowerCase();
  if (!isToken0 && tokenInLower !== state.token1.toLowerCase()) {
    throw new Error(`Token ${tokenIn} is not in pool ${state.address}`);
  }
  const reserve0 = (state.liquidity * Q96) / state.sqrtPriceX96;
  const reserve1 = (state.liquidity * state.sqrtPriceX96) / Q96;
  const reserveIn = isToken0 ? reserve0 : reserve1;
  const reserveOut = isToken0 ? reserve1 : reserve0;
  const amountInAfterFee = (amountIn * BigInt(1_000_000 - state.feePips)) / 1_000_000n;
  const amountOut = (reserveOut * amountInAfterFee) / (reserveIn + amountInAfterFee);
  const priceImpactBps = Number((amountInAfterFee * 10_000n) / (reserveIn + amountInAfterFee));
  return { amountOut, priceImpactBps };
}

// Algebra's usable tick range is [-887272, 887272]; align to the pool's spacing and
// stay symmetric around zero for a full-range position.
export function fullRangeTicks(tickSpacing: number): { tickLower: number; tickUpper: number } {
  const maxTick = Math.floor(887_272 / tickSpacing) * tickSpacing;
  return { tickLower: -maxTick, tickUpper: maxTick };
}

function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

// floor(sqrt(token0PerToken1Num / token0PerToken1Den) * 2^96)
export function sqrtPriceX96For(token0PerToken1Num: bigint, token0PerToken1Den: bigint): bigint {
  if (token0PerToken1Num < 0n || token0PerToken1Den <= 0n) throw new Error("Invalid price ratio");
  return isqrt((token0PerToken1Num << 192n) / token0PerToken1Den);
}
