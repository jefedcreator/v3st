import { hydrexSwapRouterABI } from "@hydrexfi/hydrex-sdk";
import { zeroAddress, type Address } from "viem";

import type { Prisma, Stock } from "@/server/prisma";
import { db, withTx } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { BASE_SEPOLIA_CHAIN_ID } from "@/backend/integrations/onchain-policy";
import { chainObject, chainTarget, keeperOn, publicClientOn, walletClientOn } from "@/backend/services/onchain/chains";
import { manifestFor, type NetworkManifest } from "@/backend/services/onchain/manifests";
import { readPool, type PoolState } from "@/backend/services/onchain/providers/hydrex/pool";
import { referenceUsable, tokenPriceMicroUsd } from "@/backend/services/stocks/reference";
import { settlementTokenAbi, stockTokenAbi } from "@/backend/services/onchain/abis";

const Q192 = 2n ** 192n;
const KEEPER_ADVISORY_LOCK = 72_099n;
// A run holds its lock for at most this long (approvals, swaps and receipts).
const KEEPER_RUN_TIMEOUT_MS = 600_000;

// Integer square root by Newton's method (floor).
export function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

export type PoolPrice = {
  midMicroUsd: bigint;
  sqrtPriceX96: bigint;
  stockIsToken0: boolean;
};

// The pool mid price in micro-USD per whole stock token: Algebra's sqrtPriceX96 is
// raw token1 per raw token0, and USDC raw units are micro-USD.
export function poolMidPriceMicroUsd(state: PoolState, stock: Address, decimals: number): PoolPrice {
  const stockIsToken0 = state.token0.toLowerCase() === stock.toLowerCase();
  const scale = 10n ** BigInt(decimals);
  const mid = stockIsToken0
    ? (state.sqrtPriceX96 * state.sqrtPriceX96 * scale) / Q192
    : (Q192 * scale) / (state.sqrtPriceX96 * state.sqrtPriceX96);
  return { midMicroUsd: mid, sqrtPriceX96: state.sqrtPriceX96, stockIsToken0 };
}

// The sqrtPriceX96 that puts the pool exactly at the reference price.
export function targetSqrtPriceX96(refMicroUsd: bigint, stockIsToken0: boolean, decimals: number): bigint {
  const scale = 10n ** BigInt(decimals);
  return stockIsToken0
    ? isqrt((refMicroUsd * Q192) / scale)
    : isqrt((scale * Q192) / refMicroUsd);
}

export type AlignmentPlan = {
  tokenIn: "usdc" | "stock";
  amountIn: bigint;
  limitSqrtPriceX96: bigint;
} | null;

export function planAlignment(i: {
  midMicroUsd: bigint;
  refMicroUsd: bigint;
  stockIsToken0: boolean;
  decimals: number;
  keeperUsdc: bigint;
  keeperStock: bigint;
}): AlignmentPlan {
  const diff =
    i.midMicroUsd > i.refMicroUsd ? i.midMicroUsd - i.refMicroUsd : i.refMicroUsd - i.midMicroUsd;
  if ((diff * 10_000n) / i.refMicroUsd <= BigInt(policy.app.keeper.bandBps)) return null;
  const scale = 10n ** BigInt(i.decimals);
  let tokenIn: "usdc" | "stock";
  let amountIn: bigint;
  if (i.midMicroUsd < i.refMicroUsd) {
    tokenIn = "usdc";
    amountIn =
      i.keeperUsdc < policy.app.keeper.maxSpendMicroUsd ? i.keeperUsdc : policy.app.keeper.maxSpendMicroUsd;
  } else {
    tokenIn = "stock";
    const cap = (policy.app.keeper.maxSpendMicroUsd * scale) / i.refMicroUsd;
    amountIn = i.keeperStock < cap ? i.keeperStock : cap;
  }
  if (amountIn === 0n) return null;
  return {
    tokenIn,
    amountIn,
    limitSqrtPriceX96: targetSqrtPriceX96(i.refMicroUsd, i.stockIsToken0, i.decimals),
  };
}

// A keeper swap may only use the manifest's Hydrex router, a pool the manifest
// lists, and the keeper itself as recipient, on Base Sepolia only.
export function assertKeeperSwap(
  i: {
    chainId: number;
    router: Address;
    pool: Address;
    recipient: Address;
    tokenIn: Address;
    tokenOut: Address;
  },
  manifest: NetworkManifest,
  keeper: Address,
): void {
  if (i.chainId !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Error("Keeper swaps run on Base Sepolia only");
  }
  const routerEntry = manifest.external.HydrexSwapRouter;
  if (routerEntry?.address.toLowerCase() !== i.router.toLowerCase()) {
    throw new Error("Router is not the manifest's Hydrex swap router");
  }
  const poolEntry = Object.entries(manifest.external).find(
    ([name, entry]) => name.startsWith("HydrexPool") && entry.address.toLowerCase() === i.pool.toLowerCase(),
  );
  if (!poolEntry) {
    throw new Error("Pool is not listed in the manifest");
  }
  if (i.recipient.toLowerCase() !== keeper.toLowerCase()) {
    throw new Error("Keeper swap recipient must be the keeper account");
  }
}

export type AlignmentResult = {
  stockId: string;
  action: "aligned" | "within_band" | "skipped";
  reason?: string;
};

function hydrexPoolOf(stock: Stock): string | null {
  const provenance = stock.provenance as { hydrexPool?: unknown } | null;
  return typeof provenance?.hydrexPool === "string" ? provenance.hydrexPool : null;
}

class TestPoolAligner {
  // One alignment run: for every enabled Base Sepolia stand-in with a pool and a
  // usable reference, trade the pool back within the band of the reference.
  async run(): Promise<AlignmentResult[]> {
    // A transaction-scoped advisory lock: a session lock taken through the pool
    // could be released on a different connection (or never) and stall the keeper.
    return withTx(
      async (tx) => {
        const lockRows = await tx.$queryRawUnsafe<Array<{ locked: boolean }>>(
          `SELECT pg_try_advisory_xact_lock(${KEEPER_ADVISORY_LOCK}::bigint) AS locked`,
        );
        if (!lockRows[0]?.locked) return [];
        return this.alignAll();
      },
      { timeoutMs: KEEPER_RUN_TIMEOUT_MS },
    );
  }

  private async alignAll(): Promise<AlignmentResult[]> {
    const chainId = BASE_SEPOLIA_CHAIN_ID;
    const manifest = manifestFor(chainId);
    const publicClient = publicClientOn(chainId);
    const walletClient = walletClientOn(chainId);
    const keeper = keeperOn(chainId);
    const usdc = manifest.contracts.TestSettlementToken!.address;
    const router = manifest.external.HydrexSwapRouter!.address;
    const results: AlignmentResult[] = [];
    // The spend cap applies to the whole run, across every stand-in.
    let remainingMicroUsd = policy.app.keeper.maxSpendMicroUsd;
    const stocks = await db.stock.findMany({
      where: { chain: "basesepolia", enabled: true, paused: false },
      orderBy: { symbol: "asc" },
    });
    for (const stock of stocks) {
      const pool = hydrexPoolOf(stock);
      if (!pool || !referenceUsable(stock, now()) || stock.referencePriceMicroUsd === null) {
        results.push({ stockId: stock.id, action: "skipped", reason: "no pool or usable reference" });
        continue;
      }
      const ref = tokenPriceMicroUsd(stock);
      if (ref === null) {
        results.push({ stockId: stock.id, action: "skipped", reason: "no reference price" });
        continue;
      }
      const state = await readPool(chainId, pool as Address);
      const { midMicroUsd, stockIsToken0 } = poolMidPriceMicroUsd(
        state,
        stock.tokenAddress as Address,
        stock.decimals,
      );
      const keeperUsdc = await publicClient.readContract({
        address: usdc,
        abi: settlementTokenAbi,
        functionName: "balanceOf",
        args: [keeper.address],
      });
      const keeperStock = await publicClient.readContract({
        address: stock.tokenAddress as Address,
        abi: stockTokenAbi,
        functionName: "balanceOf",
        args: [keeper.address],
      });
      const scale = 10n ** BigInt(stock.decimals);
      const diff = midMicroUsd > ref ? midMicroUsd - ref : ref - midMicroUsd;
      const outsideBand = (diff * 10_000n) / ref > BigInt(policy.app.keeper.bandBps);
      if (outsideBand && remainingMicroUsd <= 0n) {
        results.push({ stockId: stock.id, action: "skipped", reason: "run spend cap reached" });
        continue;
      }
      const stockBudget = (remainingMicroUsd * scale) / ref;
      const plan = planAlignment({
        midMicroUsd,
        refMicroUsd: ref,
        stockIsToken0,
        decimals: stock.decimals,
        keeperUsdc: keeperUsdc < remainingMicroUsd ? keeperUsdc : remainingMicroUsd,
        keeperStock: keeperStock < stockBudget ? keeperStock : stockBudget,
      });
      if (!plan && outsideBand) {
        results.push({ stockId: stock.id, action: "skipped", reason: "keeper has no balance to trade" });
        continue;
      }
      if (!plan) {
        results.push({ stockId: stock.id, action: "within_band" });
        continue;
      }
      const tokenIn = plan.tokenIn === "usdc" ? usdc : (stock.tokenAddress as Address);
      const tokenOut = plan.tokenIn === "usdc" ? (stock.tokenAddress as Address) : usdc;
      assertKeeperSwap(
        {
          chainId,
          router,
          pool: pool as Address,
          recipient: keeper.address,
          tokenIn,
          tokenOut,
        },
        manifest,
        keeper.address,
      );
      const chainNow = Number((await publicClient.getBlock({ blockTag: "latest" })).timestamp);
      const approveHash = await walletClient.writeContract({
        account: keeper,
        chain: chainObject(chainId),
        address: tokenIn,
        abi: settlementTokenAbi,
        functionName: "approve",
        args: [router, plan.amountIn],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      const hash = await walletClient.writeContract({
        account: keeper,
        chain: chainObject(chainId),
        address: router,
        abi: hydrexSwapRouterABI,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn,
            tokenOut,
            deployer: zeroAddress,
            recipient: keeper.address,
            deadline: BigInt(chainNow + 120),
            amountIn: plan.amountIn,
            amountOutMinimum: 0n,
            limitSqrtPrice: plan.limitSqrtPriceX96,
          },
        ],
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: chainTarget(chainId).confirmations,
      });
      if (receipt.status !== "success") {
        results.push({ stockId: stock.id, action: "skipped", reason: "swap reverted" });
        continue;
      }
      const after = await readPool(chainId, pool as Address);
      const afterMid = poolMidPriceMicroUsd(after, stock.tokenAddress as Address, stock.decimals).midMicroUsd;
      const data: Prisma.TestPoolAlignmentCreateInput = {
        stockId: stock.id,
        pool,
        beforeMicroUsd: midMicroUsd,
        afterMicroUsd: afterMid,
        referenceMicroUsd: ref,
        txHash: hash,
      };
      await db.testPoolAlignment.create({ data });
      remainingMicroUsd -= plan.tokenIn === "usdc" ? plan.amountIn : (plan.amountIn * ref) / scale;
      results.push({ stockId: stock.id, action: "aligned" });
    }
    return results;
  }
}

export const testPoolAligner = new TestPoolAligner();
