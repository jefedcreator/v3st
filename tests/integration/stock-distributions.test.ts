import { randomUUID } from "node:crypto";

import { type Address, type Hex, encodeFunctionData, keccak256, toHex } from "viem";
import { describe, expect, it } from "vitest";

import { executionService, registerOperationFinalizer } from "@/backend/services/execution";
import {
  hookFeeAbi,
  settlementTokenAbi,
  stockDistributionAbi,
  stockTokenAbi,
} from "@/backend/services/onchain/abis";
import { onchainRegistry } from "@/backend/services/onchain/registry";
import { basestonkProviderDescriptor, basestonkStrategyReplica } from "@/backend/services/onchain/providers/basestonk";
import { feelProviderDescriptor, feelStrategyReplica } from "@/backend/services/onchain/providers/feel";
import "@/backend/services/onchain/providers";
import { stonksProviderDescriptor, stonksStrategyReplica } from "@/backend/services/onchain/providers/stonks";
import { settlementAssetKey, testnetService } from "@/backend/services/onchain/testnet";
import type { StockProviderId, StrategyAdapter } from "@/backend/services/onchain/types";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { db } from "@/server/db";
import { toDbRaw } from "@/utils/asset-units";

import { useTestDatabase } from "../helpers/db";
import { makeUserWithWallets } from "../helpers/factories";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";

useTestDatabase();

async function setup() {
  const handle = await testnet();
  const network = await ensureTestnetNetwork();
  const u = await makeUserWithWallets();
  const ref = await testnetWalletService.ensureExecutionAccount(u.id);
  const { stock, token: pairStock } = await makeTestnetStock({ symbol: "DIST" });
  const launchToken = await handle.deployStockToken("Launch Coin", "LAUNCH", 1_000_000n * 10n ** 18n);
  const settlementKey = settlementAssetKey(handle.manifest);
  return { handle, network, u, ref, stock, pairStock, launchToken, settlementKey };
}

async function makeStrategy(input: {
  providerId: StockProviderId;
  provenance: Record<string, unknown>;
  key?: string;
}) {
  return db.strategy.create({
    data: {
      providerId: input.providerId,
      key: input.key ?? `${input.providerId}-${randomUUID()}`,
      name: `${input.providerId} distribution`,
      version: "replica-1.0.0",
      disclosureVersion: "1",
      inputAssets: [],
      receiptAsset: "none",
      rewardAssets: [],
      separateClaim: true,
      permanentLock: false,
      capBps: 2000,
      maxUsdEquivalent: toDbRaw(100_000_000n),
      provenance: input.provenance as import("@/server/prisma").Prisma.InputJsonValue,
    },
  });
}

async function runClaim(
  ctx: Awaited<ReturnType<typeof setup>>,
  providerId: StockProviderId,
  adapter: StrategyAdapter,
  strategyId: string,
  userId: string,
  walletId: string,
  custodyProfileId: string,
  recipient: Address,
  keyPrefix: string,
) {
  const context = await testnetService.defaultContext(providerId, "replica-1.0.0", custodyProfileId);
  const quote = await adapter.quote({
    userId,
    strategyId,
    positionId: null,
    action: "claim",
    inputs: [],
    context,
  });
  const op = await executionService.createOperation({
    key: `${keyPrefix}-${randomUUID()}`,
    requestHash: "test",
    kind: "strategy",
    userId,
    walletId,
    custodyProfileId,
    networkId: ctx.network.id,
    providerId,
    quoteId: null,
    authorizationId: null,
    fingerprint: "pending",
    quote,
    recipient,
  });
  await executionService.progress(op.id);
  await ctx.handle.mine(3);
  await executionService.progress(op.id);
  const row = await db.onchainOperation.findUniqueOrThrow({ where: { id: op.id } });
  return { op: row, quote };
}

async function fundEpochReward(
  ctx: Awaited<ReturnType<typeof setup>>,
  epochKey: Hex,
  rewardToken: Address,
  amount: bigint,
) {
  await ctx.handle.sendTx({
    to: rewardToken,
    data: encodeFunctionData({ abi: stockTokenAbi, functionName: "approve", args: [ctx.handle.stockDistribution, amount] }),
  });
  await ctx.handle.sendTx({
    to: ctx.handle.stockDistribution,
    data: encodeFunctionData({ abi: stockDistributionAbi, functionName: "fundEpoch", args: [epochKey, amount] }),
  });
}

describe("source-specific stock reward replicas on the local testnet", () => {
  it("stonksVersionMismatchRejects: generation mismatch rejects, duplicate claim confirms once", { timeout: 60_000 }, async () => {
    const ctx = await setup();
    let confirmedClaimCount = 0;
    const prefix = "stonks";
    registerOperationFinalizer("strategy", async (op, observation) => {
      if (observation.state === "confirmed" && op.key.startsWith(prefix)) confirmedClaimCount += 1;
    });
    const epochKey = keccak256(toHex("stonks:gen2-launch"));
    await ctx.handle.sendTx({
      to: ctx.handle.stockDistribution,
      data: encodeFunctionData({
        abi: stockDistributionAbi,
        functionName: "createEpoch",
        args: [epochKey, ctx.pairStock, 2],
      }),
    });
    const entitlement = 100n * 10n ** 18n;
    await ctx.handle.sendTx({
      to: ctx.handle.stockDistribution,
      data: encodeFunctionData({
        abi: stockDistributionAbi,
        functionName: "setEntitlement",
        args: [epochKey, ctx.ref.accountAddress, entitlement],
      }),
    });
    await ctx.handle.sendTx({
      to: ctx.pairStock,
      data: encodeFunctionData({ abi: stockTokenAbi, functionName: "transfer", args: [ctx.handle.account.address, entitlement] }),
    });
    await fundEpochReward(ctx, epochKey, ctx.pairStock, entitlement);
    const gen2 = await makeStrategy({
      providerId: "stonks",
      provenance: { source: "stonks", distribution: ctx.handle.stockDistribution, launchId: epochKey, generation: 2 },
    });
    const gen1 = await makeStrategy({
      providerId: "stonks",
      provenance: { source: "stonks", distribution: ctx.handle.stockDistribution, launchId: epochKey, generation: 1 },
    });
    const context = await testnetService.defaultContext("stonks", "replica-1.0.0", ctx.ref.custodyProfileId);
    await expect(
      stonksStrategyReplica.quote({ userId: ctx.u.id, strategyId: gen1.id, positionId: null, action: "claim", inputs: [], context }),
    ).rejects.toThrow(/generation mismatch/);
    expect(() => onchainRegistry.spot("stonks", context)).toThrow(/no spot adapter/);
    const before = await ctx.handle.tokenBalance(ctx.pairStock, ctx.ref.accountAddress);
    const first = await runClaim(ctx, "stonks", stonksStrategyReplica, gen2.id, ctx.u.id, ctx.ref.wallet.id, ctx.ref.custodyProfileId, ctx.ref.accountAddress, prefix);
    expect(first.op.status).toBe("finalized");
    expect(await ctx.handle.tokenBalance(ctx.pairStock, ctx.ref.accountAddress)).toBe(before + entitlement);
    const duplicate = await runClaim(ctx, "stonks", stonksStrategyReplica, gen2.id, ctx.u.id, ctx.ref.wallet.id, ctx.ref.custodyProfileId, ctx.ref.accountAddress, prefix);
    expect(duplicate.op.status).toBe("reverted");
    expect(confirmedClaimCount).toBe(1);
    expect(stonksProviderDescriptor.realProviderCalls).toEqual([]);
  });

  it("basestonkUnknownHookRejects: unknown hook rejects, changed fee recipient is paid, duplicate confirms once", { timeout: 60_000 }, async () => {
    const ctx = await setup();
    let confirmedClaimCount = 0;
    const prefix = "basestonk";
    registerOperationFinalizer("strategy", async (op, observation) => {
      if (observation.state === "confirmed" && op.key.startsWith(prefix)) confirmedClaimCount += 1;
    });
    const hook = ctx.handle.hookFee;
    const launchId = keccak256(toHex("basestonk:launch:1"));
    const unknownLaunchId = keccak256(toHex("basestonk:launch:unknown"));
    const hookVersion = keccak256(toHex("v3st-hook:v1"));
    const unknownStrategy = await makeStrategy({
      providerId: "basestonk",
      provenance: { source: "basestonk", hook, launchId: unknownLaunchId },
    });
    const context = await testnetService.defaultContext("basestonk", "replica-1.0.0", ctx.ref.custodyProfileId);
    await expect(
      basestonkStrategyReplica.quote({ userId: ctx.u.id, strategyId: unknownStrategy.id, positionId: null, action: "claim", inputs: [], context }),
    ).rejects.toThrow(/unknown hook/);
    await ctx.handle.sendTx({
      to: hook,
      data: encodeFunctionData({ abi: hookFeeAbi, functionName: "addHookVersion", args: [hookVersion] }),
    });
    const recipient1 = ctx.handle.account.address;
    await ctx.handle.sendTx({
      to: hook,
      data: encodeFunctionData({
        abi: hookFeeAbi,
        functionName: "registerLaunch",
        args: [launchId, hookVersion, 25, recipient1, ctx.handle.settlement],
      }),
    });
    await ctx.handle.mintSettlement(ctx.handle.account.address, 100_000n);
    await ctx.handle.sendTx({
      to: ctx.handle.settlement,
      data: encodeFunctionData({ abi: settlementTokenAbi, functionName: "approve", args: [hook, 100_000n] }),
    });
    await ctx.handle.sendTx({
      to: hook,
      data: encodeFunctionData({ abi: hookFeeAbi, functionName: "accrueFees", args: [launchId, 50_000n] }),
    });
    const strategy = await makeStrategy({
      providerId: "basestonk",
      provenance: { source: "basestonk", hook, launchId },
    });
    const before1 = await ctx.handle.settlementBalance(recipient1);
    const first = await runClaim(ctx, "basestonk", basestonkStrategyReplica, strategy.id, ctx.u.id, ctx.ref.wallet.id, ctx.ref.custodyProfileId, ctx.ref.accountAddress, prefix);
    expect(first.op.status).toBe("finalized");
    expect(await ctx.handle.settlementBalance(recipient1)).toBe(before1 + 50_000n);
    const duplicate = await runClaim(ctx, "basestonk", basestonkStrategyReplica, strategy.id, ctx.u.id, ctx.ref.wallet.id, ctx.ref.custodyProfileId, ctx.ref.accountAddress, prefix);
    expect(duplicate.op.status).toBe("reverted");
    expect(confirmedClaimCount).toBe(1);
    // Changed fee recipient: the next claim pays the current recipient.
    const recipient2 = ctx.ref.accountAddress;
    await ctx.handle.sendTx({
      to: hook,
      data: encodeFunctionData({ abi: hookFeeAbi, functionName: "setFeeRecipient", args: [launchId, recipient2] }),
    });
    await ctx.handle.sendTx({
      to: hook,
      data: encodeFunctionData({ abi: hookFeeAbi, functionName: "accrueFees", args: [launchId, 25_000n] }),
    });
    const before2 = await ctx.handle.settlementBalance(recipient2);
    const third = await runClaim(ctx, "basestonk", basestonkStrategyReplica, strategy.id, ctx.u.id, ctx.ref.wallet.id, ctx.ref.custodyProfileId, ctx.ref.accountAddress, `${prefix}-recipient`);
    expect(third.op.status).toBe("finalized");
    expect(await ctx.handle.settlementBalance(recipient2)).toBe(before2 + 25_000n);
    expect(basestonkProviderDescriptor.realProviderCalls).toEqual([]);
  });

  it("feelStockOnlyHolderGetsZero: launch-holding snapshot entitles, stock-only holder gets zero", { timeout: 60_000 }, async () => {
    const ctx = await setup();
    let confirmedClaimCount = 0;
    const prefix = "feel";
    registerOperationFinalizer("strategy", async (op, observation) => {
      if (observation.state === "confirmed" && op.key.startsWith(prefix)) confirmedClaimCount += 1;
    });
    const epochKey = keccak256(toHex("feel:launch:1"));
    await ctx.handle.sendTx({
      to: ctx.handle.stockDistribution,
      data: encodeFunctionData({ abi: stockDistributionAbi, functionName: "createEpoch", args: [epochKey, ctx.pairStock, 1] }),
    });
    const entitlementA = 50n * 10n ** 18n;
    await ctx.handle.sendTx({
      to: ctx.handle.stockDistribution,
      data: encodeFunctionData({ abi: stockDistributionAbi, functionName: "setEntitlement", args: [epochKey, ctx.ref.accountAddress, entitlementA] }),
    });
    await ctx.handle.sendTx({
      to: ctx.pairStock,
      data: encodeFunctionData({ abi: stockTokenAbi, functionName: "transfer", args: [ctx.handle.account.address, entitlementA] }),
    });
    await fundEpochReward(ctx, epochKey, ctx.pairStock, entitlementA);
    // User B holds only the pair stock (no launch token): no entitlement.
    const u2 = await makeUserWithWallets();
    const ref2 = await testnetWalletService.ensureExecutionAccount(u2.id);
    await ctx.handle.sendTx({
      to: ctx.pairStock,
      data: encodeFunctionData({ abi: stockTokenAbi, functionName: "transfer", args: [ref2.accountAddress, 10n * 10n ** 18n] }),
    });
    await ctx.handle.sendTx({
      to: ctx.launchToken,
      data: encodeFunctionData({ abi: stockTokenAbi, functionName: "transfer", args: [ctx.ref.accountAddress, 5n * 10n ** 18n] }),
    });
    const strategy = await makeStrategy({
      providerId: "feel",
      provenance: { source: "feel", distribution: ctx.handle.stockDistribution, launchId: epochKey, launchToken: ctx.launchToken },
    });
    // Prior-holder entitlement survives balance changes after the snapshot: move the
    // launch tokens away before claiming.
    await ctx.handle.sendTx({
      to: ctx.launchToken,
      data: encodeFunctionData({ abi: stockTokenAbi, functionName: "transfer", args: [ctx.handle.account.address, 5n * 10n ** 18n] }),
    });
    const beforeA = await ctx.handle.tokenBalance(ctx.pairStock, ctx.ref.accountAddress);
    const firstA = await runClaim(ctx, "feel", feelStrategyReplica, strategy.id, ctx.u.id, ctx.ref.wallet.id, ctx.ref.custodyProfileId, ctx.ref.accountAddress, prefix);
    expect(firstA.op.status).toBe("finalized");
    expect(await ctx.handle.tokenBalance(ctx.pairStock, ctx.ref.accountAddress)).toBe(beforeA + entitlementA);
    const duplicateA = await runClaim(ctx, "feel", feelStrategyReplica, strategy.id, ctx.u.id, ctx.ref.wallet.id, ctx.ref.custodyProfileId, ctx.ref.accountAddress, prefix);
    expect(duplicateA.op.status).toBe("reverted");
    expect(confirmedClaimCount).toBe(1);
    const beforeB = await ctx.handle.tokenBalance(ctx.pairStock, ref2.accountAddress);
    const claimB = await runClaim(ctx, "feel", feelStrategyReplica, strategy.id, u2.id, ref2.wallet.id, ref2.custodyProfileId, ref2.accountAddress, `${prefix}-b`);
    expect(claimB.op.status).toBe("reverted");
    expect(await ctx.handle.tokenBalance(ctx.pairStock, ref2.accountAddress)).toBe(beforeB);
    // Zero reward funds: entitled but unfunded epoch reverts on claim.
    const emptyEpoch = keccak256(toHex("feel:launch:empty"));
    await ctx.handle.sendTx({
      to: ctx.handle.stockDistribution,
      data: encodeFunctionData({ abi: stockDistributionAbi, functionName: "createEpoch", args: [emptyEpoch, ctx.pairStock, 1] }),
    });
    await ctx.handle.sendTx({
      to: ctx.handle.stockDistribution,
      data: encodeFunctionData({ abi: stockDistributionAbi, functionName: "setEntitlement", args: [emptyEpoch, ctx.ref.accountAddress, 10n * 10n ** 18n] }),
    });
    const emptyStrategy = await makeStrategy({
      providerId: "feel",
      provenance: { source: "feel", distribution: ctx.handle.stockDistribution, launchId: emptyEpoch, launchToken: ctx.launchToken },
    });
    const claimEmpty = await runClaim(ctx, "feel", feelStrategyReplica, emptyStrategy.id, ctx.u.id, ctx.ref.wallet.id, ctx.ref.custodyProfileId, ctx.ref.accountAddress, `${prefix}-empty`);
    expect(claimEmpty.op.status).toBe("reverted");
    expect(feelProviderDescriptor.realProviderCalls).toEqual([]);
  });
});
