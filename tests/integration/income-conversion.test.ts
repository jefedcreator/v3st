import { randomUUID } from "node:crypto";

import { encodeFunctionData, keccak256, toHex } from "viem";
import { describe, expect, it } from "vitest";

import { now } from "@/backend/clock";
import { db } from "@/server/db";
import { earningsService } from "@/backend/services/earnings";
import { earningsBatchService } from "@/backend/services/earnings/batch";
import { investmentService } from "@/backend/services/investments";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { lagosWeek } from "@/backend/services/jobs/schedule";
import { hookFeeAbi, settlementTokenAbi, stockDistributionAbi, stockTokenAbi } from "@/backend/services/onchain/abis";
import "@/backend/services/onchain/providers";
import { settlementAssetKey } from "@/backend/services/onchain/testnet";
import { rewardService } from "@/backend/services/rewards";
import { simVenue } from "@/backend/services/simulator/venue";
import { strategyService } from "@/backend/services/strategies";
import { kycService } from "@/backend/services/kyc";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { fromDbRaw, fromDbRawNullable, toDbRaw } from "@/utils/asset-units";

import { oneTimeAuth, standingAuth } from "../helpers/authorizations";
import { useTestDatabase } from "../helpers/db";
import { makeBankAccount, makeStock, seedFloat, seedTreasury } from "../helpers/factories";
import { drainJobs } from "../helpers/worker";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";

useTestDatabase();

const SEED_SETTLEMENT = 1_000_000_000_000n;
const SEED_STOCK = 500_000n * 10n ** 18n;
const ENTITLEMENT = 100n * 10n ** 18n;

async function setup(symbol: string) {
  const handle = await testnet();
  const network = await ensureTestnetNetwork();
  const u = await (await import("../helpers/factories")).makeUserWithWallets();
  await kycService.verify(u.id, { persona: "ada_tier2" });
  await makeBankAccount(u.id);
  const ref = await testnetWalletService.ensureExecutionAccount(u.id);
  const { stock, token: pairStock } = await makeTestnetStock({ symbol, referencePriceMicroUsd: 2_000_000n });
  await handle.seedO1Pool(pairStock, SEED_SETTLEMENT, SEED_STOCK);
  await handle.mintSettlement(ref.accountAddress, 10_000_000n);
  const settlementKey = settlementAssetKey(handle.manifest);
  const epochKey = keccak256(toHex(`stonks:conv:${symbol}`));
  await handle.sendTx({
    to: handle.stockDistribution,
    data: encodeFunctionData({ abi: stockDistributionAbi, functionName: "createEpoch", args: [epochKey, pairStock, 1] }),
  });
  await handle.sendTx({
    to: handle.stockDistribution,
    data: encodeFunctionData({ abi: stockDistributionAbi, functionName: "setEntitlement", args: [epochKey, ref.accountAddress, ENTITLEMENT] }),
  });
  await handle.sendTx({
    to: pairStock,
    data: encodeFunctionData({ abi: stockTokenAbi, functionName: "transfer", args: [handle.account.address, ENTITLEMENT] }),
  });
  await handle.sendTx({
    to: pairStock,
    data: encodeFunctionData({ abi: stockTokenAbi, functionName: "approve", args: [handle.stockDistribution, ENTITLEMENT] }),
  });
  await handle.sendTx({
    to: handle.stockDistribution,
    data: encodeFunctionData({ abi: stockDistributionAbi, functionName: "fundEpoch", args: [epochKey, ENTITLEMENT] }),
  });
  const strategy = await db.strategy.create({
    data: {
      providerId: "stonks",
      key: `stonks-conv-${symbol}-${randomUUID()}`,
      name: "stonks distribution",
      version: "replica-1.0.0",
      disclosureVersion: "1",
      inputAssets: [],
      receiptAsset: "none",
      rewardAssets: [],
      separateClaim: true,
      permanentLock: false,
      capBps: 2000,
      maxUsdEquivalent: toDbRaw(100_000_000n),
      provenance: { source: "stonks", distribution: handle.stockDistribution, launchId: epochKey, generation: 1 },
    },
  });
  // Background reward conversion requires standing reward_conversion consent.
  const conversionAuth = await standingAuth(u.id, { stockIds: [stock.id] }, ["reward_conversion"]);
  return { handle, network, u, ref, stock, pairStock, settlementKey, epochKey, strategy, conversionAuth };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function driveStrategyOp(ctx: Ctx, operationId: string) {
  for (let i = 0; i < 10; i += 1) {
    const op = await db.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
    if (["finalized", "reverted", "failed"].includes(op.status)) return op;
    await strategyService.progress(operationId);
    await ctx.handle.mine(3);
  }
  return db.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
}

async function claimStockReward(ctx: Ctx): Promise<string> {
  const q = await strategyService.quote(ctx.u.id, { strategyId: ctx.strategy.id, action: "claim" });
  const auth = await oneTimeAuth(ctx.u.id, q, "strategy");
  const op = await strategyService.confirm(ctx.u.id, q.id, auth.id, `claim-${randomUUID()}`);
  const row = await driveStrategyOp(ctx, op.operation_id);
  expect(row.status).toBe("finalized");
  const receipt = await db.rewardReceipt.findFirstOrThrow({ where: { txHash: row.txHash } });
  return receipt.id;
}

async function driveConversion(ctx: Ctx, receiptId: string): Promise<void> {
  const investment = await db.investment.findUniqueOrThrow({ where: { key: `convert:${receiptId}` } });
  for (let i = 0; i < 10; i += 1) {
    const row = await db.investment.findUniqueOrThrow({ where: { id: investment.id } });
    if (["filled", "partial", "failed"].includes(row.status)) return;
    await investmentService.progress(investment.id);
    await ctx.handle.mine(3);
  }
}

async function claimSettlementReward(ctx: Ctx, launchId: string, amount: bigint): Promise<string> {
  const hook = ctx.handle.hookFee;
  const hookVersion = keccak256(toHex(`hook:${launchId}`));
  await ctx.handle.sendTx({
    to: hook,
    data: encodeFunctionData({ abi: hookFeeAbi, functionName: "addHookVersion", args: [hookVersion] }),
  });
  await ctx.handle.sendTx({
    to: hook,
    data: encodeFunctionData({
      abi: hookFeeAbi,
      functionName: "registerLaunch",
      args: [launchId as `0x${string}`, hookVersion, 25, ctx.ref.accountAddress, ctx.handle.settlement],
    }),
  });
  await ctx.handle.mintSettlement(ctx.handle.account.address, amount);
  await ctx.handle.sendTx({
    to: ctx.handle.settlement,
    data: encodeFunctionData({ abi: settlementTokenAbi, functionName: "approve", args: [hook, amount] }),
  });
  await ctx.handle.sendTx({
    to: hook,
    data: encodeFunctionData({ abi: hookFeeAbi, functionName: "accrueFees", args: [launchId as `0x${string}`, amount] }),
  });
  const strategy = await db.strategy.create({
    data: {
      providerId: "basestonk",
      key: `basestonk-conv-${randomUUID()}`,
      name: "basestonk hook fees",
      version: "replica-1.0.0",
      disclosureVersion: "1",
      inputAssets: [],
      receiptAsset: "none",
      rewardAssets: [],
      separateClaim: true,
      permanentLock: false,
      capBps: 2000,
      maxUsdEquivalent: toDbRaw(100_000_000n),
      provenance: { source: "basestonk", hook, launchId },
    },
  });
  const q = await strategyService.quote(ctx.u.id, { strategyId: strategy.id, action: "claim" });
  const auth = await oneTimeAuth(ctx.u.id, q, "strategy");
  const op = await strategyService.confirm(ctx.u.id, q.id, auth.id, `claim-${randomUUID()}`);
  const row = await driveStrategyOp(ctx, op.operation_id);
  expect(row.status).toBe("finalized");
  const receipt = await db.rewardReceipt.findFirstOrThrow({ where: { txHash: row.txHash } });
  return receipt.id;
}

describe("receipt-backed income conversion and Friday payout", () => {
  it("repairs a crash after conversion confirmation without a second quote or operation", async () => {
    const ctx = await setup("RECOVER");
    const receiptId = await claimStockReward(ctx);
    const operationId = await rewardService.convert(receiptId, ctx.conversionAuth.id);
    await db.rewardReceipt.update({ where: { id: receiptId }, data: { state: "received_asset", conversionOperationId: null } });
    expect(await rewardService.convert(receiptId, ctx.conversionAuth.id)).toBe(operationId);
    expect(await db.investment.count({ where: { key: `convert:${receiptId}` } })).toBe(1);
  });

  it("unconvertedRewardCannotPayout", { timeout: 90_000 }, async () => {
    const ctx = await setup("UNC");
    const receiptId = await claimStockReward(ctx);
    const receipt = await db.rewardReceipt.findUniqueOrThrow({ where: { id: receiptId } });
    expect(receipt.state).toBe("received_asset");
    expect(receipt.asset).toBe(ctx.stock.assetKey);
    // The reward asset is preserved as stock inventory, not cash.
    expect(await ledgerService.balance(acct.userStock(ctx.u.id, ctx.stock.id))).toBe(ENTITLEMENT);
    expect(await ledgerService.balance(acct.userEarnings(ctx.u.id, "testnet"))).toBe(0n);
    // Recognizing without a finalized conversion records nothing.
    await earningsService.recognize(receiptId);
    expect(await db.earning.count({ where: { receiptId } })).toBe(0);
    expect((await db.rewardReceipt.findUniqueOrThrow({ where: { id: receiptId } })).state).toBe("received_asset");
    // The Friday batch cannot pay an unconverted reward asset.
    await seedFloat("yellowcard", 1_000_000_000_000n);
    await seedTreasury("testnet", 1_000_000_000_000n);
    await earningsService.setPreference(ctx.u.id, { mode: "payout" });
    const week = lagosWeek(now());
    const r = await earningsBatchService.runBatch(week, now());
    expect(r.paid).toBe(0);
    expect(await db.rampOrder.count({ where: { kind: "earnings_payout" } })).toBe(0);
    expect(await ledgerService.balance(acct.userEarnings(ctx.u.id, "testnet"))).toBe(0n);
  });

  it("conversionThenRecognizeThenFridayPayout", { timeout: 90_000 }, async () => {
    const ctx = await setup("CNV");
    const receiptId = await claimStockReward(ctx);
    // Consent-bound sell of the reward asset.
    const opId = await rewardService.convert(receiptId, ctx.conversionAuth.id);
    expect(opId).toBeTruthy();
    const receiptMid = await db.rewardReceipt.findUniqueOrThrow({ where: { id: receiptId } });
    expect(receiptMid.state).toBe("conversion_pending");
    expect(receiptMid.conversionOperationId).toBe(opId);
    // Replaying convert returns the same operation.
    expect(await rewardService.convert(receiptId, ctx.conversionAuth.id)).toBe(opId);
    await driveConversion(ctx, receiptId);
    const investment = await db.investment.findUniqueOrThrow({ where: { key: `convert:${receiptId}` } });
    expect(["filled", "partial"]).toContain(investment.status);
    const proceeds = fromDbRawNullable(investment.amountOut) ?? 0n;
    expect(proceeds).toBeGreaterThan(0n);
    // Recognize the finalized settlement proceeds once.
    await earningsService.recognize(receiptId);
    await earningsService.recognize(receiptId);
    const earning = await db.earning.findUniqueOrThrow({ where: { receiptId } });
    expect(earning.provenance).toBe("stonks_distribution");
    expect(BigInt(earning.amountUsdc)).toBe(proceeds);
    expect((await db.rewardReceipt.findUniqueOrThrow({ where: { id: receiptId } })).state).toBe("available");
    const allocation = await db.earningAllocation.findUniqueOrThrow({ where: { receiptId } });
    expect(allocation.state).toBe("available");
    expect(fromDbRaw(allocation.amountUsdc)).toBe(proceeds);
    // Proceeds moved from cash into earnings exactly once.
    expect(await ledgerService.balance(acct.userEarnings(ctx.u.id, "testnet"))).toBe(proceeds);
    expect(await ledgerService.balance(acct.userCash(ctx.u.id, "testnet"))).toBe(0n);
    expect(await db.ledgerJournal.count({ where: { kind: "conversionProceedsRecognized" } })).toBe(1);
    // Friday batch pays from the finalized proceeds.
    await seedFloat("yellowcard", 1_000_000_000_000n);
    await seedTreasury("testnet", 1_000_000_000_000n);
    await earningsService.setPreference(ctx.u.id, { mode: "payout" });
    const week = lagosWeek(now());
    const r = await earningsBatchService.runBatch(week, now());
    expect(r.paid).toBe(1);
    const order = await db.rampOrder.findFirstOrThrow({ where: { kind: "earnings_payout", userId: ctx.u.id } });
    expect((await db.earning.findUniqueOrThrow({ where: { receiptId } })).payoutOrderId).toBe(order.id);
    const allocationAfter = await db.earningAllocation.findUniqueOrThrow({ where: { receiptId } });
    expect(allocationAfter.state).toBe("reserved");
    expect(allocationAfter.payoutOrderId).toBe(order.id);
    expect((await db.rewardReceipt.findUniqueOrThrow({ where: { id: receiptId } })).state).toBe("reserved_for_payout");
    // Reserved is not paid in the listing.
    const listed = await earningsService.list(ctx.u.id, { page: 1, size: 10 });
    expect(listed.data[0]?.status).toBe("pending");
    // Final paid state flips the report and the allocation/receipt.
    await db.rampOrder.update({ where: { id: order.id }, data: { status: "paid" } });
    await earningsService.markPayoutFinal(order.id);
    const listedAfter = await earningsService.list(ctx.u.id, { page: 1, size: 10 });
    expect(listedAfter.data[0]?.status).toBe("paid");
    expect((await db.earningAllocation.findUniqueOrThrow({ where: { receiptId } })).state).toBe("paid");
    expect((await db.rewardReceipt.findUniqueOrThrow({ where: { id: receiptId } })).state).toBe("paid");
  });

  it("payoutReferenceIsNotPaidStatus", { timeout: 90_000 }, async () => {
    const ctx = await setup("REF");
    const receiptId = await claimSettlementReward(ctx, keccak256(toHex("basestonk:ref:1")), 2_000_000n);
    const receipt = await db.rewardReceipt.findUniqueOrThrow({ where: { id: receiptId } });
    expect(receipt.asset).toBe(ctx.settlementKey);
    // Settlement receipts need no conversion: recognize records the proceeds once.
    await earningsService.recognize(receiptId);
    expect((await db.rewardReceipt.findUniqueOrThrow({ where: { id: receiptId } })).state).toBe("available");
    expect(await ledgerService.balance(acct.userEarnings(ctx.u.id, "testnet"))).toBe(2_000_000n);
    await seedFloat("yellowcard", 1_000_000_000_000n);
    await seedTreasury("testnet", 1_000_000_000_000n);
    await earningsService.setPreference(ctx.u.id, { mode: "payout" });
    const week = lagosWeek(now());
    const r = await earningsBatchService.runBatch(week, now());
    expect(r.paid).toBe(1);
    const earning = await db.earning.findUniqueOrThrow({ where: { receiptId } });
    // The payout reference is attached (reserved), but the week is not paid yet.
    expect(earning.payoutOrderId).not.toBeNull();
    const listed = await earningsService.list(ctx.u.id, { page: 1, size: 10 });
    expect(listed.data[0]?.status).toBe("pending");
    expect(listed.data[0]?.pending_usdc).toBe("2000000");
  });

  it("failedReinvestReleasesOnce", { timeout: 90_000 }, async () => {
    const ctx = await setup("REI");
    const receiptId = await claimSettlementReward(ctx, keccak256(toHex("basestonk:rei:1")), 2_000_000n);
    await earningsService.recognize(receiptId);
    expect(await ledgerService.balance(acct.userEarnings(ctx.u.id, "testnet"))).toBe(2_000_000n);
    // Sim-stock reinvest keeps the legacy trade pipeline; onchain stocks reinvest
    // through the investment pipeline (see tests/integration/onchain-reinvest.test.ts).
    const simStock = await makeStock({ symbol: `SIM${randomUUID().slice(0, 6)}`, chain: "testnet" });
    await earningsService.setPreference(ctx.u.id, { mode: "reinvest", stock_id: simStock.id });
    await seedFloat("yellowcard", 1_000_000_000_000n);
    await seedTreasury("testnet", 1_000_000_000_000n);
    const week = lagosWeek(now());
    // The sim venue swap reverts, so the reinvest fails and must release once.
    await simVenue.addFault("swap", `reinvest:${ctx.u.id}:${week}`);
    const r = await earningsBatchService.runBatch(week, now());
    expect(r.reinvested).toBe(1);
    const trade = await db.tradeOrder.findUniqueOrThrow({ where: { key: `reinvest:${ctx.u.id}:${week}` } });
    expect(trade.fundsSource).toBe("earnings");
    const allocation = await db.earningAllocation.findUniqueOrThrow({ where: { receiptId } });
    expect(allocation.state).toBe("reserved");
    expect(allocation.reinvestTradeId).toBe(trade.id);
    // The testnet reinvest has no fresh authorization: it lands in needs_confirmation
    // and fails; the release happens exactly once across both failure paths.
    await drainJobs();
    const after = await db.tradeOrder.findUniqueOrThrow({ where: { id: trade.id } });
    expect(after.status).toBe("failed");
    expect(await ledgerService.balance(acct.userEarnings(ctx.u.id, "testnet"))).toBe(2_000_000n);
    expect(await db.ledgerJournal.count({ where: { key: `${trade.key}:release` } })).toBe(1);
    const allocationAfter = await db.earningAllocation.findUniqueOrThrow({ where: { receiptId } });
    expect(allocationAfter.state).toBe("available");
    expect(allocationAfter.reinvestTradeId).toBeNull();
    expect((await db.rewardReceipt.findUniqueOrThrow({ where: { id: receiptId } })).state).toBe("available");
    expect(await db.earning.findUniqueOrThrow({ where: { receiptId } })).toMatchObject({ reinvestTradeId: null });
  });

  it("lateReceiptRollsForwardWithoutChangingAccrualWeek", { timeout: 90_000 }, async () => {
    const ctx = await setup("LATE");
    const receiptId = await claimSettlementReward(ctx, keccak256(toHex("basestonk:late:1")), 2_000_000n);
    // The receipt accrued in an earlier week; recognition happens now.
    await db.rewardReceipt.update({ where: { id: receiptId }, data: { week: "2026-11-02", accrualPeriod: "2026-11-02" } });
    await earningsService.recognize(receiptId);
    const earning = await db.earning.findUniqueOrThrow({ where: { receiptId } });
    expect(earning.week).toBe("2026-11-02");
    const allocation = await db.earningAllocation.findUniqueOrThrow({ where: { receiptId } });
    expect(allocation.week).toBe("2026-11-02");
    // The current week's batch rolls the late receipt forward and pays it.
    await seedFloat("yellowcard", 1_000_000_000_000n);
    await seedTreasury("testnet", 1_000_000_000_000n);
    await earningsService.setPreference(ctx.u.id, { mode: "payout" });
    const week = lagosWeek(now());
    const r = await earningsBatchService.runBatch(week, now());
    expect(r.paid).toBe(1);
    const after = await db.earning.findUniqueOrThrow({ where: { receiptId } });
    expect(after.week).toBe("2026-11-02");
    expect((await db.earningAllocation.findUniqueOrThrow({ where: { receiptId } })).week).toBe("2026-11-02");
    expect(after.payoutOrderId).not.toBeNull();
  });

  it("duplicateFridayWorkersAllocateEachReceiptOnce", { timeout: 90_000 }, async () => {
    const ctx = await setup("DUP");
    const receiptId = await claimSettlementReward(ctx, keccak256(toHex("basestonk:dup:1")), 2_000_000n);
    await earningsService.recognize(receiptId);
    await seedFloat("yellowcard", 1_000_000_000_000n);
    await seedTreasury("testnet", 1_000_000_000_000n);
    await earningsService.setPreference(ctx.u.id, { mode: "payout" });
    const week = lagosWeek(now());
    await Promise.all([
      earningsBatchService.runBatch(week, now()),
      earningsBatchService.runBatch(week, now()),
    ]);
    const orders = await db.rampOrder.findMany({ where: { kind: "earnings_payout", userId: ctx.u.id } });
    expect(orders).toHaveLength(1);
    const allocations = await db.earningAllocation.findMany({ where: { receiptId } });
    expect(allocations).toHaveLength(1);
    expect(allocations[0]?.state).toBe("reserved");
    expect(allocations[0]?.payoutOrderId).toBe(orders[0]!.id);
    expect(await db.earning.count({ where: { receiptId, payoutOrderId: { not: null } } })).toBe(1);
  });
});
