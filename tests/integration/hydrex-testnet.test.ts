import { randomUUID } from "node:crypto";

import { type Address, type Hex, encodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import { executionService, registerOperationFinalizer } from "@/backend/services/execution";
import { hydrexPoolAbi, hydropumpLockerAbi, settlementTokenAbi, stockTokenAbi } from "@/backend/services/onchain/abis";
import {
  hydrexStrategyReplica,
  type HydrexStrategyProvenance,
} from "@/backend/services/onchain/providers/hydrex";
import "@/backend/services/onchain/providers";
import {
  chainDeadlineFromNow,
  publicClientFor,
  rpcRequest,
  settlementAssetKey,
  testnetRpcUrl,
  testnetService,
} from "@/backend/services/onchain/testnet";
import type { StrategyQuote } from "@/backend/services/onchain/types";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { db } from "@/server/db";
import { toDbRaw } from "@/utils/asset-units";

import { useTestDatabase } from "../helpers/db";
import { makeUserWithWallets } from "../helpers/factories";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";

useTestDatabase();

const SEED_SETTLEMENT = 1_000_000_000_000n;
const SEED_STOCK = 500_000n * 10n ** 18n;

async function setup(symbol = "HYDX") {
  const handle = await testnet();
  const network = await ensureTestnetNetwork();
  const u = await makeUserWithWallets();
  const ref = await testnetWalletService.ensureExecutionAccount(u.id);
  const { stock, token } = await makeTestnetStock({ symbol });
  const pool = await handle.deployHydrexPool(token);
  await db.stock.update({
    where: { id: stock.id },
    data: {
      provenance: {
        integration_kind: "local_testnet_replica",
        network_id: handle.manifest.networkId,
        deployment_id: handle.manifest.deploymentId,
        hydrexPool: pool,
      },
    },
  });
  const settlementKey = settlementAssetKey(handle.manifest);
  await handle.mintSettlement(handle.account.address, SEED_SETTLEMENT);
  await handle.sendTx({
    to: token,
    data: encodeFunctionData({ abi: stockTokenAbi, functionName: "transfer", args: [handle.account.address, SEED_STOCK] }),
  });
  await handle.sendTx({
    to: handle.settlement,
    data: encodeFunctionData({ abi: settlementTokenAbi, functionName: "approve", args: [pool, SEED_SETTLEMENT] }),
  });
  await handle.sendTx({
    to: token,
    data: encodeFunctionData({ abi: stockTokenAbi, functionName: "approve", args: [pool, SEED_STOCK] }),
  });
  await handle.sendTx({
    to: pool,
    data: encodeFunctionData({ abi: hydrexPoolAbi, functionName: "seed", args: [SEED_SETTLEMENT, SEED_STOCK] }),
  });
  const strategy = await db.strategy.create({
    data: {
      providerId: "hydrex",
      key: `hydrex-lp-${symbol}-${randomUUID()}`,
      name: `${symbol} LP replica`,
      version: "replica-1.0.0",
      disclosureVersion: "1",
      inputAssets: [settlementKey, stock.assetKey!],
      receiptAsset: `lp:31337:${pool.toLowerCase()}`,
      rewardAssets: [stock.assetKey!],
      separateClaim: true,
      permanentLock: false,
      capBps: 2000,
      maxUsdEquivalent: toDbRaw(100_000_000n),
      provenance: { pool, stockId: stock.id } satisfies HydrexStrategyProvenance,
    },
  });
  await handle.mintSettlement(ref.accountAddress, 10_000_000n);
  await handle.sendTx({
    to: token,
    data: encodeFunctionData({ abi: stockTokenAbi, functionName: "transfer", args: [ref.accountAddress, 1_000n * 10n ** 18n] }),
  });
  const context = await testnetService.defaultContext("hydrex", "replica-1.0.0", ref.custodyProfileId);
  return { handle, network, u, ref, stock, token, pool, strategy, settlementKey, context };
}

async function runStrategyOp(
  ctx: Awaited<ReturnType<typeof setup>>,
  quote: StrategyQuote,
): Promise<string> {
  const op = await executionService.createOperation({
    key: `hydrex-op-${randomUUID()}`,
    requestHash: "test",
    kind: "strategy",
    userId: ctx.u.id,
    walletId: ctx.ref.wallet.id,
    custodyProfileId: ctx.ref.custodyProfileId,
    networkId: ctx.network.id,
    providerId: "hydrex",
    quoteId: null,
    authorizationId: null,
    fingerprint: "pending",
    quote,
    recipient: ctx.ref.accountAddress,
  });
  await executionService.progress(op.id);
  await ctx.handle.mine(3);
  await executionService.progress(op.id);
  return op.id;
}

async function enter(ctx: Awaited<ReturnType<typeof setup>>, settlementRaw: bigint, stockRaw: bigint) {
  const quote = await hydrexStrategyReplica.quote({
    userId: ctx.u.id,
    strategyId: ctx.strategy.id,
    positionId: null,
    action: "enter",
    inputs: [
      { asset: ctx.settlementKey, raw: settlementRaw },
      { asset: ctx.stock.assetKey!, raw: stockRaw },
    ],
    context: await testnetService.defaultContext("hydrex", "replica-1.0.0", ctx.ref.custodyProfileId),
  });
  return runStrategyOp(ctx, quote);
}

async function claim(ctx: Awaited<ReturnType<typeof setup>>, userId = ctx.u.id, walletId?: string, custodyProfileId?: string) {
  const ref = walletId
    ? await db.wallet.findUniqueOrThrow({ where: { id: walletId } })
    : ctx.ref.wallet;
  const profileId = custodyProfileId ?? ctx.ref.custodyProfileId;
  const quote = await hydrexStrategyReplica.quote({
    userId,
    strategyId: ctx.strategy.id,
    positionId: null,
    action: "claim",
    inputs: [],
    context: await testnetService.defaultContext("hydrex", "replica-1.0.0", profileId),
  });
  const op = await executionService.createOperation({
    key: `hydrex-op-${randomUUID()}`,
    requestHash: "test",
    kind: "strategy",
    userId,
    walletId: ref.id,
    custodyProfileId: profileId,
    networkId: ctx.network.id,
    providerId: "hydrex",
    quoteId: null,
    authorizationId: null,
    fingerprint: "pending",
    quote,
    recipient: ref.executionAddress as Address,
  });
  await executionService.progress(op.id);
  await ctx.handle.mine(3);
  await executionService.progress(op.id);
  return op.id;
}

async function exitOp(ctx: Awaited<ReturnType<typeof setup>>, shares: bigint) {
  const quote = await hydrexStrategyReplica.quote({
    userId: ctx.u.id,
    strategyId: ctx.strategy.id,
    positionId: null,
    action: "exit",
    inputs: [{ asset: ctx.strategy.receiptAsset, raw: shares }],
    context: await testnetService.defaultContext("hydrex", "replica-1.0.0", ctx.ref.custodyProfileId),
  });
  return runStrategyOp(ctx, quote);
}

async function swapOnPool(ctx: Awaited<ReturnType<typeof setup>>, amountIn: bigint, minOut = 0n) {
  await handle_mint(ctx, amountIn);
  await ctx.handle.sendTx({
    to: ctx.handle.settlement,
    data: encodeFunctionData({ abi: settlementTokenAbi, functionName: "approve", args: [ctx.pool, amountIn] }),
  });
  const deadline = BigInt(Math.floor((await chainDeadlineFromNow()).getTime() / 1000));
  return ctx.handle.sendTx({
    to: ctx.pool,
    data: encodeFunctionData({
      abi: hydrexPoolAbi,
      functionName: "swapExactIn",
      args: [ctx.handle.settlement, ctx.token, amountIn, minOut, ctx.handle.account.address, deadline],
    }),
  });
}

async function handle_mint(ctx: Awaited<ReturnType<typeof setup>>, amount: bigint) {
  await ctx.handle.mintSettlement(ctx.handle.account.address, amount);
}

async function readLockerUint(locker: Address, functionName: "principalLocked", lockId: bigint): Promise<bigint> {
  const value: unknown = await publicClientFor().readContract({
    address: locker,
    abi: hydropumpLockerAbi,
    functionName,
    args: [lockId],
  });
  return value as bigint;
}

async function sharesOf(pool: Address, account: Address): Promise<bigint> {
  const value: unknown = await publicClientFor().readContract({
    address: pool,
    abi: hydrexPoolAbi,
    functionName: "sharesOf",
    args: [account],
  });
  return value as bigint;
}

async function claimableFees(pool: Address, account: Address): Promise<[bigint, bigint]> {
  const value: unknown = await publicClientFor().readContract({
    address: pool,
    abi: hydrexPoolAbi,
    functionName: "claimableFees",
    args: [account],
  });
  return value as [bigint, bigint];
}

describe("hydrex pool and hydropump locker replicas on the local testnet", () => {
  it("feesRequireLiquidityOwnership", { timeout: 60_000 }, async () => {
    const ctx = await setup("FEES");
    await enter(ctx, 1_000_000n, 500n * 10n ** 18n);
    const shares = await sharesOf(ctx.pool, ctx.ref.accountAddress);
    expect(shares).toBeGreaterThan(0n);
    await swapOnPool(ctx, 100_000n);
    const [claimableSettle] = await claimableFees(ctx.pool, ctx.ref.accountAddress);
    expect(claimableSettle).toBeGreaterThan(0n);
    const before = await ctx.handle.settlementBalance(ctx.ref.accountAddress);
    const claimOpId = await claim(ctx);
    const claimRow = await db.onchainOperation.findUniqueOrThrow({ where: { id: claimOpId } });
    expect(claimRow.status).toBe("finalized");
    const after = await ctx.handle.settlementBalance(ctx.ref.accountAddress);
    expect(after - before).toBe(claimableSettle);
    // A non-LP cannot claim: the onchain call reverts and nothing settles.
    const u2 = await makeUserWithWallets();
    const ref2 = await testnetWalletService.ensureExecutionAccount(u2.id);
    await handle_mint(ctx, 0n);
    await ctx.handle.mintSettlement(ref2.accountAddress, 1_000_000n);
    const badClaim = await claim(ctx, u2.id, ref2.wallet.id, ref2.custodyProfileId);
    const badRow = await db.onchainOperation.findUniqueOrThrow({ where: { id: badClaim } });
    expect(badRow.status).toBe("reverted");
    expect(await ctx.handle.settlementBalance(ref2.accountAddress)).toBe(1_000_000n);
  });

  it("idlePoolPaysZero", { timeout: 60_000 }, async () => {
    const ctx = await setup("IDLE");
    await enter(ctx, 1_000_000n, 500n * 10n ** 18n);
    const before = await ctx.handle.settlementBalance(ctx.ref.accountAddress);
    const claimOpId = await claim(ctx);
    const row = await db.onchainOperation.findUniqueOrThrow({ where: { id: claimOpId } });
    expect(row.status).toBe("finalized");
    const after = await ctx.handle.settlementBalance(ctx.ref.accountAddress);
    expect(after - before).toBe(0n);
    const [claimableSettle, claimableStock] = await claimableFees(ctx.pool, ctx.ref.accountAddress);
    expect(claimableSettle).toBe(0n);
    expect(claimableStock).toBe(0n);
  });

  it("exitReturnsPrincipalSeparatelyFromFees", { timeout: 60_000 }, async () => {
    const ctx = await setup("EXIT");
    registerOperationFinalizer("strategy", async () => undefined);
    const entrySettle = 1_000_000n;
    const entryStock = 500n * 10n ** 18n;
    await enter(ctx, entrySettle, entryStock);
    const shares = await sharesOf(ctx.pool, ctx.ref.accountAddress);
    await swapOnPool(ctx, 100_000n);
    const [claimableBefore] = await claimableFees(ctx.pool, ctx.ref.accountAddress);
    expect(claimableBefore).toBeGreaterThan(0n);
    const settleBeforeExit = await ctx.handle.settlementBalance(ctx.ref.accountAddress);
    const stockBeforeExit = await ctx.handle.tokenBalance(ctx.token, ctx.ref.accountAddress);
    await exitOp(ctx, shares);
    const settleAfterExit = await ctx.handle.settlementBalance(ctx.ref.accountAddress);
    const stockAfterExit = await ctx.handle.tokenBalance(ctx.token, ctx.ref.accountAddress);
    // Principal came back; fees were NOT paid by the withdraw (separate claim).
    expect(settleAfterExit).toBeGreaterThan(settleBeforeExit);
    expect(stockAfterExit).toBeGreaterThan(stockBeforeExit);
    const [claimableAfterExit] = await claimableFees(ctx.pool, ctx.ref.accountAddress);
    expect(claimableAfterExit).toBe(claimableBefore);
    // The claim then pays the fees separately.
    await claim(ctx);
    const [claimableFinal] = await claimableFees(ctx.pool, ctx.ref.accountAddress);
    expect(claimableFinal).toBe(0n);
    expect(await ctx.handle.settlementBalance(ctx.ref.accountAddress)).toBe(settleAfterExit + claimableBefore);
    // Loss fixture: a second position exits at a loss while fees stay positive.
    const u2 = await makeUserWithWallets();
    const ref2 = await testnetWalletService.ensureExecutionAccount(u2.id);
    await ctx.handle.mintSettlement(ref2.accountAddress, 10_000_000n);
    await ctx.handle.sendTx({
      to: ctx.token,
      data: encodeFunctionData({ abi: stockTokenAbi, functionName: "transfer", args: [ref2.accountAddress, 1_000n * 10n ** 18n] }),
    });
    const ctx2 = { ...ctx, u: u2, ref: ref2 };
    const entryValue = entrySettle + (entryStock * 2_000_000n) / 10n ** 18n;
    await enter(ctx2, entrySettle, entryStock);
    await swapOnPool(ctx, 100_000n);
    await ctx.handle.sendTx({
      to: ctx.pool,
      data: encodeFunctionData({ abi: hydrexPoolAbi, functionName: "applyLoss", args: [5_000n] }),
    });
    const shares2 = await sharesOf(ctx.pool, ref2.accountAddress);
    const settleBefore2 = await ctx.handle.settlementBalance(ref2.accountAddress);
    const stockBefore2 = await ctx.handle.tokenBalance(ctx.token, ref2.accountAddress);
    await exitOp(ctx2, shares2);
    const settleAfter2 = await ctx.handle.settlementBalance(ref2.accountAddress);
    const stockAfter2 = await ctx.handle.tokenBalance(ctx.token, ref2.accountAddress);
    const exitValue = (settleAfter2 - settleBefore2) + ((stockAfter2 - stockBefore2) * 2_000_000n) / 10n ** 18n;
    expect(exitValue).toBeLessThan(entryValue);
    const [fees2] = await claimableFees(ctx.pool, ref2.accountAddress);
    expect(fees2).toBeGreaterThan(0n);
  });

  it("lockedLaunchCannotWithdrawPrincipal", { timeout: 60_000 }, async () => {
    const ctx = await setup("LOCK");
    const locker = ctx.handle.hydropumpLocker;
    const principal = 100n * 10n ** 18n;
    await ctx.handle.sendTx({
      to: ctx.token,
      data: encodeFunctionData({ abi: stockTokenAbi, functionName: "approve", args: [locker, principal] }),
    });
    await ctx.handle.sendTx({
      to: locker,
      data: encodeFunctionData({
        abi: hydropumpLockerAbi,
        functionName: "lock",
        args: [ctx.handle.settlement, ctx.token, principal, ctx.handle.account.address],
      }),
    });
    const lockId = 0n;
    const lockedValue: unknown = await publicClientFor().readContract({
      address: locker,
      abi: hydropumpLockerAbi,
      functionName: "principalLocked",
      args: [lockId],
    });
    const locked = lockedValue as bigint;
    expect(locked).toBe(principal);
    await handle_mint(ctx, 50_000n);
    await ctx.handle.sendTx({
      to: ctx.handle.settlement,
      data: encodeFunctionData({ abi: settlementTokenAbi, functionName: "approve", args: [locker, 50_000n] }),
    });
    await ctx.handle.sendTx({
      to: locker,
      data: encodeFunctionData({ abi: hydropumpLockerAbi, functionName: "fundFees", args: [lockId, 50_000n] }),
    });
    // Withdrawal always reverts: principal is permanently locked.
    await expect(
      rpcRequest(testnetRpcUrl(), "eth_call", [
        {
          from: ctx.handle.account.address,
          to: locker,
          data: encodeFunctionData({ abi: hydropumpLockerAbi, functionName: "withdraw", args: [lockId] }),
        },
        "latest",
      ]),
    ).rejects.toThrow(/permanently locked/);
    expect(await readLockerUint(locker, "principalLocked", lockId)).toBe(principal);
    // Non-beneficiary fee claims revert.
    await expect(
      rpcRequest(testnetRpcUrl(), "eth_call", [
        {
          from: "0x000000000000000000000000000000000000dEaD",
          to: locker,
          data: encodeFunctionData({ abi: hydropumpLockerAbi, functionName: "claimFees", args: [lockId] }),
        },
        "latest",
      ]),
    ).rejects.toThrow(/beneficiary only/);
    // The beneficiary claims the funded fees.
    const before = await ctx.handle.settlementBalance(ctx.handle.account.address);
    await ctx.handle.sendTx({
      to: locker,
      data: encodeFunctionData({ abi: hydropumpLockerAbi, functionName: "claimFees", args: [lockId] }),
    });
    const after = await ctx.handle.settlementBalance(ctx.handle.account.address);
    expect(after - before).toBe(50_000n);
  });
});
