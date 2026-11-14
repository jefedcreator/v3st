import { randomUUID } from "node:crypto";

import { encodeFunctionData, keccak256, toHex } from "viem";
import { describe, expect, it } from "vitest";

import { authorizationService } from "@/backend/services/authorizations";
import { pack } from "@/backend/services/execution";
import { hookFeeAbi, settlementTokenAbi, stockDistributionAbi, stockTokenAbi } from "@/backend/services/onchain/abis";
import "@/backend/services/onchain/providers";
import { settlementAssetKey } from "@/backend/services/onchain/testnet";
import type { StrategyQuote } from "@/backend/services/onchain/types";
import { rewardService } from "@/backend/services/rewards";
import { strategyService } from "@/backend/services/strategies";
import { acct } from "@/backend/services/ledger/accounts";
import { ledgerService } from "@/backend/services/ledger";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { db } from "@/server/db";
import { fromDbRaw, toDbRaw } from "@/utils/asset-units";

import { useTestDatabase } from "../helpers/db";
import { makeUserWithWallets } from "../helpers/factories";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";

useTestDatabase();

async function setup(symbol: string) {
  const handle = await testnet();
  const network = await ensureTestnetNetwork();
  const u = await makeUserWithWallets();
  const ref = await testnetWalletService.ensureExecutionAccount(u.id);
  const { stock, token: pairStock } = await makeTestnetStock({ symbol, referencePriceMicroUsd: 2_000_000n });
  const settlementKey = settlementAssetKey(handle.manifest);
  return { handle, network, u, ref, stock, pairStock, settlementKey };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function makeStrategy(providerId: string, provenance: Record<string, unknown>) {
  return db.strategy.create({
    data: {
      providerId,
      key: `${providerId}-${randomUUID()}`,
      name: `${providerId} distribution`,
      version: "replica-1.0.0",
      disclosureVersion: "1",
      inputAssets: [],
      receiptAsset: "none",
      rewardAssets: [],
      separateClaim: true,
      permanentLock: false,
      capBps: 2000,
      maxUsdEquivalent: toDbRaw(100_000_000n),
      provenance: provenance as never,
    },
  });
}

async function strategyAuth(ctx: Ctx, strategyId: string) {
  const { dto } = await authorizationService.create(
    ctx.u.id,
    { scope: "strategies", strategyId, maxSpendUsdc: 1_000_000_000_000n, durationDays: 7, policyVersion: "test" },
    randomUUID(),
  );
  return dto;
}

async function driveClaim(ctx: Ctx, strategyId: string, authId: string) {
  const q = await strategyService.quote(ctx.u.id, { strategyId, action: "claim" });
  const op = await strategyService.confirm(ctx.u.id, q.id, authId, `claim-${randomUUID()}`);
  for (let i = 0; i < 10; i += 1) {
    const row = await db.onchainOperation.findUniqueOrThrow({ where: { id: op.operation_id } });
    if (["finalized", "reverted", "failed"].includes(row.status)) return row;
    await strategyService.progress(op.operation_id);
    await ctx.handle.mine(3);
  }
  return db.onchainOperation.findUniqueOrThrow({ where: { id: op.operation_id } });
}

describe("confirmed reward receipts from finalized source proceeds", () => {
  it("twoClaimsSameEventYieldOneReceiptAndOneCredit", { timeout: 90_000 }, async () => {
    const ctx = await setup("STK");
    const epochKey = keccak256(toHex("stonks:task11:one-credit"));
    await ctx.handle.sendTx({
      to: ctx.handle.stockDistribution,
      data: encodeFunctionData({
        abi: stockDistributionAbi,
        functionName: "createEpoch",
        args: [epochKey, ctx.pairStock, 1],
      }),
    });
    const entitlement = 1_000_000n;
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
    await ctx.handle.sendTx({
      to: ctx.pairStock,
      data: encodeFunctionData({ abi: stockTokenAbi, functionName: "approve", args: [ctx.handle.stockDistribution, entitlement] }),
    });
    await ctx.handle.sendTx({
      to: ctx.handle.stockDistribution,
      data: encodeFunctionData({ abi: stockDistributionAbi, functionName: "fundEpoch", args: [epochKey, entitlement] }),
    });
    const strategy = await makeStrategy("stonks", {
      source: "stonks",
      distribution: ctx.handle.stockDistribution,
      launchId: epochKey,
      generation: 1,
    });
    const auth = await strategyAuth(ctx, strategy.id);
    const op = await driveClaim(ctx, strategy.id, auth.id);
    expect(op.status).toBe("finalized");

    const receipts = await db.rewardReceipt.findMany();
    expect(receipts.length).toBe(1);
    const receipt = receipts[0]!;
    expect(receipt.source).toBe("stonks_distribution");
    expect(fromDbRaw(receipt.amountRaw)).toBe(entitlement);
    expect(receipt.asset).toBe(ctx.stock.assetKey);
    expect(receipt.state).toBe("received_asset");
    expect(receipt.txHash).toBe(op.txHash);
    expect(await ledgerService.balance(acct.userStock(ctx.u.id, ctx.stock.id))).toBe(entitlement);
    expect(await db.ledgerJournal.count({ where: { kind: "rewardReceived" } })).toBe(1);

    // Replaying the same finalized operation (worker retry) changes nothing.
    await rewardService.recordFinalized(op.id);
    expect(await db.rewardReceipt.count()).toBe(1);
    expect(await db.ledgerJournal.count({ where: { kind: "rewardReceived" } })).toBe(1);

    // A second operation carrying the same transaction (same event) also collapses
    // to the single receipt and single credit.
    const quote = (op.expected as { quote?: unknown }).quote as StrategyQuote;
    const duplicate = await db.onchainOperation.create({
      data: {
        key: `dup-${randomUUID()}`,
        requestHash: "test",
        kind: "strategy",
        userId: ctx.u.id,
        walletId: ctx.ref.wallet.id,
        custodyProfileId: ctx.ref.custodyProfileId,
        networkId: ctx.network.id,
        providerId: "stonks",
        status: "finalized",
        txHash: op.txHash,
        fingerprint: "test",
        requiredConfirmations: 2,
        expected: pack({ quote, recipient: ctx.ref.accountAddress }) as never,
      },
    });
    await rewardService.recordFinalized(duplicate.id);
    expect(await db.rewardReceipt.count()).toBe(1);
    expect(await db.ledgerJournal.count({ where: { kind: "rewardReceived" } })).toBe(1);
    expect(await ledgerService.balance(acct.userStock(ctx.u.id, ctx.stock.id))).toBe(entitlement);
  });

  it("zeroEntitlementClaimYieldsNoReceipt", { timeout: 90_000 }, async () => {
    const ctx = await setup("FEEL0");
    const epochKey = keccak256(toHex("feel:task11:zero"));
    await ctx.handle.sendTx({
      to: ctx.handle.stockDistribution,
      data: encodeFunctionData({
        abi: stockDistributionAbi,
        functionName: "createEpoch",
        args: [epochKey, ctx.pairStock, 1],
      }),
    });
    // No entitlement is set for the execution account: the onchain claim reverts.
    const strategy = await makeStrategy("feel", {
      source: "feel",
      distribution: ctx.handle.stockDistribution,
      launchId: epochKey,
      launchToken: ctx.pairStock,
    });
    const auth = await strategyAuth(ctx, strategy.id);
    const op = await driveClaim(ctx, strategy.id, auth.id);
    expect(op.status).toBe("reverted");
    await rewardService.recordFinalized(op.id);
    expect(await db.rewardReceipt.count()).toBe(0);
    expect(await db.ledgerJournal.count({ where: { kind: "rewardReceived" } })).toBe(0);
    expect(await ledgerService.balance(acct.userStock(ctx.u.id, ctx.stock.id))).toBe(0n);
  });

  it("hookFeeClaimCreditsEarningsOnce", { timeout: 90_000 }, async () => {
    const ctx = await setup("BSTK");
    const hook = ctx.handle.hookFee;
    const launchId = keccak256(toHex("basestonk:task11:fees"));
    const hookVersion = keccak256(toHex("v3st-hook:task11"));
    await ctx.handle.sendTx({
      to: hook,
      data: encodeFunctionData({ abi: hookFeeAbi, functionName: "addHookVersion", args: [hookVersion] }),
    });
    // The fee recipient is the user's execution account, so the FeesClaimed log
    // names it as beneficiary.
    await ctx.handle.sendTx({
      to: hook,
      data: encodeFunctionData({
        abi: hookFeeAbi,
        functionName: "registerLaunch",
        args: [launchId, hookVersion, 25, ctx.ref.accountAddress, ctx.handle.settlement],
      }),
    });
    await ctx.handle.mintSettlement(ctx.handle.account.address, 50_000n);
    await ctx.handle.sendTx({
      to: ctx.handle.settlement,
      data: encodeFunctionData({ abi: settlementTokenAbi, functionName: "approve", args: [hook, 50_000n] }),
    });
    await ctx.handle.sendTx({
      to: hook,
      data: encodeFunctionData({ abi: hookFeeAbi, functionName: "accrueFees", args: [launchId, 50_000n] }),
    });
    const strategy = await makeStrategy("basestonk", { source: "basestonk", hook, launchId });
    const auth = await strategyAuth(ctx, strategy.id);
    const op = await driveClaim(ctx, strategy.id, auth.id);
    expect(op.status).toBe("finalized");
    const receipts = await db.rewardReceipt.findMany();
    expect(receipts.length).toBe(1);
    expect(receipts[0]!.source).toBe("basestonk_hook_fees");
    expect(receipts[0]!.asset).toBe(ctx.settlementKey);
    expect(fromDbRaw(receipts[0]!.amountRaw)).toBe(50_000n);
    expect(await ledgerService.balance(acct.userEarnings(ctx.u.id, "testnet"))).toBe(50_000n);
    await rewardService.recordFinalized(op.id);
    expect(await db.rewardReceipt.count()).toBe(1);
    expect(await ledgerService.balance(acct.userEarnings(ctx.u.id, "testnet"))).toBe(50_000n);
  });
});
