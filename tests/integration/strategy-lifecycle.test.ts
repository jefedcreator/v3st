import { randomUUID } from "node:crypto";

import { type Address, encodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import { authorizationService } from "@/backend/services/authorizations";
import { investmentService } from "@/backend/services/investments";
import { acct } from "@/backend/services/ledger/accounts";
import { ledgerService } from "@/backend/services/ledger";
import { hydrexPoolAbi, settlementTokenAbi, stockTokenAbi } from "@/backend/services/onchain/abis";
import "@/backend/services/onchain/providers";
import { chainDeadlineFromNow, publicClientFor, settlementAssetKey } from "@/backend/services/onchain/testnet";
import { strategyService } from "@/backend/services/strategies";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { db, withTx } from "@/server/db";
import { openingBalance } from "@/backend/services/ledger/postings";
import { fromDbRaw, toDbRaw } from "@/utils/asset-units";

import { useTestDatabase } from "../helpers/db";
import { fundCash, makeUserWithWallets } from "../helpers/factories";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";

useTestDatabase();

const SEED_SETTLEMENT = 1_000_000_000_000n;
const SEED_STOCK = 500_000n * 10n ** 18n;
const CASH = 1_000_000_000n;

async function setup(symbol: string, opts?: { separateClaim?: boolean; supply?: bigint; onchainStock?: boolean }) {
  const handle = await testnet();
  const network = await ensureTestnetNetwork();
  const u = await makeUserWithWallets();
  const ref = await testnetWalletService.ensureExecutionAccount(u.id);
  const { stock, token } = await makeTestnetStock({
    symbol,
    referencePriceMicroUsd: 2_000_000n,
    supply: opts?.supply ?? 10_000_000n * 10n ** 18n,
  });
  const pool = await handle.deployHydrexPool(token);
  await db.stock.update({
    where: { id: stock.id },
    data: { provenance: { ...(stock.provenance as object), hydrexPool: pool } },
  });
  await handle.seedO1Pool(token, SEED_SETTLEMENT, SEED_STOCK);
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
      separateClaim: opts?.separateClaim ?? true,
      permanentLock: false,
      capBps: 2000,
      maxUsdEquivalent: toDbRaw(100_000_000n),
      provenance: { pool, stockId: stock.id },
    },
  });
  await handle.mintSettlement(ref.accountAddress, 100_000_000n);
  const onchainStock = 100_000n * 10n ** 18n;
  const ledgerStock = opts?.onchainStock !== false ? onchainStock : 0n;
  if (ledgerStock > 0n) {
    await handle.sendTx({
      to: token,
      data: encodeFunctionData({ abi: stockTokenAbi, functionName: "transfer", args: [ref.accountAddress, onchainStock] }),
    });
  }
  // The onchain funding mirrors a ledger balance: stock held by the execution
  // account is owned by the user in the ledger.
  if (ledgerStock > 0n) {
    await withTx((tx) =>
      ledgerService.post(tx, openingBalance({ account: acct.userStock(u.id, stock.id), amount: ledgerStock })),
    );
  }
  await fundCash(u.id, CASH, "testnet");
  const { dto: auth } = await authorizationService.create(
    u.id,
    { scope: "strategies", strategyId: strategy.id, maxSpendUsdc: 1_000_000_000_000n, durationDays: 7, policyVersion: "test" },
    randomUUID(),
  );
  return { handle, network, u, ref, stock, token, pool, strategy, settlementKey, auth };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function drive(ctx: Ctx, operationId: string) {
  for (let i = 0; i < 10; i += 1) {
    const op = await db.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
    if (["finalized", "reverted", "failed"].includes(op.status)) return op;
    await strategyService.progress(operationId);
    await ctx.handle.mine(3);
  }
  return db.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
}

async function enterExplicit(ctx: Ctx, settlementRaw: bigint, stockRaw: bigint) {
  const q = await strategyService.quote(ctx.u.id, {
    strategyId: ctx.strategy.id,
    action: "enter",
    inputs: [
      { asset: ctx.settlementKey, raw: settlementRaw },
      { asset: ctx.stock.assetKey!, raw: stockRaw },
    ],
  });
  const confirmed = await strategyService.confirm(ctx.u.id, q.id, ctx.auth.id, `enter-${randomUUID()}`);
  const op = await drive(ctx, confirmed.operation_id);
  return { q, op, confirmed };
}

async function buyStock(ctx: Ctx, inputRaw: bigint) {
  const { dto: invAuth } = await authorizationService.create(
    ctx.u.id,
    { scope: "investments", stockId: ctx.stock.id, maxSpendUsdc: 100_000_000_000n, durationDays: 7, policyVersion: "test" },
    randomUUID(),
  );
  const q = await investmentService.quote(ctx.u.id, { stockId: ctx.stock.id, side: "buy", inputRaw });
  const inv = await investmentService.confirm(ctx.u.id, q.id, invAuth.id, `buy-${randomUUID()}`);
  for (let i = 0; i < 10; i += 1) {
    const row = await db.investment.findUniqueOrThrow({ where: { id: inv.id } });
    if (["filled", "partial", "failed"].includes(row.status)) break;
    await investmentService.progress(inv.id);
    await ctx.handle.mine(3);
  }
  return investmentService.get(ctx.u.id, inv.id);
}

async function swapOnPool(ctx: Ctx, amountIn: bigint) {
  await ctx.handle.mintSettlement(ctx.handle.account.address, amountIn);
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
      args: [ctx.handle.settlement, ctx.token, amountIn, 0n, ctx.handle.account.address, deadline],
    }),
  });
}

async function depositFromRelayer(ctx: Ctx, settlementRaw: bigint, stockRaw: bigint) {
  await ctx.handle.mintSettlement(ctx.handle.account.address, settlementRaw);
  await ctx.handle.sendTx({
    to: ctx.token,
    data: encodeFunctionData({ abi: stockTokenAbi, functionName: "transfer", args: [ctx.handle.account.address, stockRaw] }),
  });
  await ctx.handle.sendTx({
    to: ctx.handle.settlement,
    data: encodeFunctionData({ abi: settlementTokenAbi, functionName: "approve", args: [ctx.pool, settlementRaw] }),
  });
  await ctx.handle.sendTx({
    to: ctx.token,
    data: encodeFunctionData({ abi: stockTokenAbi, functionName: "approve", args: [ctx.pool, stockRaw] }),
  });
  return ctx.handle.sendTx({
    to: ctx.pool,
    data: encodeFunctionData({
      abi: hydrexPoolAbi,
      functionName: "deposit",
      args: [settlementRaw, stockRaw, 0n, ctx.handle.account.address],
    }),
  });
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

async function positionOf(ctx: Ctx) {
  return db.strategyPosition.findFirstOrThrow({ where: { userId: ctx.u.id } });
}

describe("opt-in strategy lifecycle on the local testnet", () => {
  it("enterThenExitSettlesReservationsAndReceiptExactly", { timeout: 90_000 }, async () => {
    const ctx = await setup("LIFE");
    // A direct stock purchase never selects a strategy.
    const stockBeforeBuy = await ledgerService.balance(acct.userStock(ctx.u.id, ctx.stock.id));
    const buy = await buyStock(ctx, 2_000_000n);
    expect(buy?.status).toBe("filled");
    expect(await db.strategyPosition.count({ where: { userId: ctx.u.id } })).toBe(0);
    const stockOwned = await ledgerService.balance(acct.userStock(ctx.u.id, ctx.stock.id));
    expect(stockOwned).toBe(stockBeforeBuy + BigInt(buy!.amount_out!));

    const settlementIn = 500_000n;
    const stockIn = 25n * 10n ** 18n;
    const cashBefore = await ledgerService.balance(acct.userCash(ctx.u.id, "testnet"));
    const stockBefore = await ledgerService.balance(acct.userStock(ctx.u.id, ctx.stock.id));
    const { op } = await enterExplicit(ctx, settlementIn, stockIn);
    expect(op.status).toBe("finalized");
    const position = await positionOf(ctx);
    expect(position.state).toBe("active");
    const shares = await sharesOf(ctx.pool, ctx.ref.accountAddress);
    expect(fromDbRaw(position.receiptRaw)).toBe(shares);
    expect(shares).toBeGreaterThan(0n);
    // Reservations fully consumed into the venue.
    expect(await ledgerService.balance(acct.userReserved(ctx.u.id, "testnet"))).toBe(0n);
    expect(await ledgerService.balance(acct.userCash(ctx.u.id, "testnet"))).toBe(cashBefore - settlementIn);
    expect(await ledgerService.balance(acct.userStock(ctx.u.id, ctx.stock.id))).toBe(stockBefore - stockIn);
    expect(fromDbRaw(position.principalUsdc)).toBeGreaterThan(0n);

    // Exit burns only the owned receipt and returns principal separately.
    const q = await strategyService.quote(ctx.u.id, { positionId: position.id, action: "exit" });
    const exitOp = await strategyService.confirm(ctx.u.id, q.id, ctx.auth.id, `exit-${randomUUID()}`);
    await drive(ctx, exitOp.operation_id);
    const exited = await db.onchainOperation.findUniqueOrThrow({ where: { id: exitOp.operation_id } });
    expect(exited.status).toBe("finalized");
    const after = await positionOf(ctx);
    expect(after.state).toBe("exited");
    expect(fromDbRaw(after.receiptRaw)).toBe(0n);
    expect(await sharesOf(ctx.pool, ctx.ref.accountAddress)).toBe(0n);
    const cashAfter = await ledgerService.balance(acct.userCash(ctx.u.id, "testnet"));
    const stockAfter = await ledgerService.balance(acct.userStock(ctx.u.id, ctx.stock.id));
    expect(cashAfter).toBeGreaterThan(cashBefore - settlementIn);
    expect(stockAfter).toBeGreaterThan(stockBefore - stockIn);
    expect(fromDbRaw(after.valueUsdc!)).toBeGreaterThan(0n);
  });

  it("concurrentSaleAndEntryCannotSpendSameStock", { timeout: 90_000 }, async () => {
    const ctx = await setup("RACE", { onchainStock: false });
    const buy = await buyStock(ctx, 2_000_000n);
    expect(buy?.status).toBe("filled");
    const stockOwned = BigInt(buy!.amount_out!);
    expect(stockOwned).toBeGreaterThan(0n);
    const { dto: invAuth } = await authorizationService.create(
      ctx.u.id,
      { scope: "investments", stockId: ctx.stock.id, maxSpendUsdc: 10n ** 30n, durationDays: 7, policyVersion: "test" },
      randomUUID(),
    );
    const sellQuote = await investmentService.quote(ctx.u.id, {
      stockId: ctx.stock.id,
      side: "sell",
      inputRaw: stockOwned,
    });
    const enterQuote = await strategyService.quote(ctx.u.id, {
      strategyId: ctx.strategy.id,
      action: "enter",
      inputs: [
        { asset: ctx.settlementKey, raw: 500_000n },
        { asset: ctx.stock.assetKey!, raw: stockOwned },
      ],
    });
    const sellKey = `sell-${randomUUID()}`;
    const enterKey = `enter-${randomUUID()}`;
    const results = await Promise.allSettled([
      investmentService.confirm(ctx.u.id, sellQuote.id, invAuth.id, sellKey),
      strategyService.confirm(ctx.u.id, enterQuote.id, ctx.auth.id, enterKey),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok.length).toBe(1);
    expect(failed.length).toBe(1);
    const rejected = failed[0];
    if (rejected?.status !== "rejected") throw new Error("expected one rejection");
    expect(String(rejected.reason)).toMatch(/Insufficient funds/);
    // The stock was reserved exactly once, by exactly one operation.
    expect(await ledgerService.balance(acct.userStockReserved(ctx.u.id, ctx.stock.id))).toBe(stockOwned);
    expect(await ledgerService.balance(acct.userStock(ctx.u.id, ctx.stock.id))).toBe(0n);
    const enterWon = results[1]?.status === "fulfilled";
    expect(await db.onchainOperation.count({ where: { key: `strat-op:${enterKey}` } })).toBe(enterWon ? 1 : 0);
    expect(await db.onchainOperation.count({ where: { key: `inv-op:${sellKey}` } })).toBe(enterWon ? 0 : 1);
  });

  it("claimWithoutEntitlementIsZero", { timeout: 90_000 }, async () => {
    const ctx = await setup("ZERO");
    const { op } = await enterExplicit(ctx, 500_000n, 25n * 10n ** 18n);
    expect(op.status).toBe("finalized");
    const position = await positionOf(ctx);
    // No trading activity: zero fees. The claim still finalizes onchain but proves
    // no transfer, so no receipt and no credit exist.
    const q = await strategyService.quote(ctx.u.id, { positionId: position.id, action: "claim" });
    const claimOp = await strategyService.confirm(ctx.u.id, q.id, ctx.auth.id, `claim-${randomUUID()}`);
    const claimRow = await drive(ctx, claimOp.operation_id);
    expect(claimRow.status).toBe("finalized");
    expect(await db.rewardReceipt.count()).toBe(0);
    expect(await db.ledgerJournal.count({ where: { kind: "rewardReceived" } })).toBe(0);
    expect(await ledgerService.balance(acct.userEarnings(ctx.u.id, "testnet"))).toBe(0n);
  });

  it("embeddedFeesRequireExit", { timeout: 90_000 }, async () => {
    const ctx = await setup("EMBED", { separateClaim: false });
    // Separate claim is unsupported for the exit-realized variant.
    await expect(
      strategyService.quote(ctx.u.id, { strategyId: ctx.strategy.id, action: "claim" }),
    ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    const { op } = await enterExplicit(ctx, 500_000n, 25n * 10n ** 18n);
    expect(op.status).toBe("finalized");
    const position = await positionOf(ctx);
    await expect(
      strategyService.quote(ctx.u.id, { positionId: position.id, action: "claim" }),
    ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    // Fees accrue from trading activity, then realize on exit (withdrawAndClaim).
    await swapOnPool(ctx, 100_000n);
    const q = await strategyService.quote(ctx.u.id, { positionId: position.id, action: "exit" });
    const exitOp = await strategyService.confirm(ctx.u.id, q.id, ctx.auth.id, `exit-${randomUUID()}`);
    const row = await drive(ctx, exitOp.operation_id);
    expect(row.status).toBe("finalized");
    const after = await positionOf(ctx);
    expect(after.state).toBe("exited");
    const receipts = await db.rewardReceipt.findMany();
    expect(receipts.length).toBeGreaterThan(0);
    const settleReceipt = receipts.find((r) => r.asset === ctx.settlementKey);
    expect(settleReceipt).toBeDefined();
    expect(fromDbRaw(settleReceipt!.amountRaw)).toBeGreaterThan(0n);
    expect(settleReceipt!.source).toBe("hydrex_lp_fees");
    expect(settleReceipt!.state).toBe("received_asset");
    // Exactly one settlement-fee credit, equal to the receipt amount.
    expect(await ledgerService.balance(acct.userEarnings(ctx.u.id, "testnet"))).toBe(fromDbRaw(settleReceipt!.amountRaw));
  });

  it("entryFailureRetainsIntermediateAssets", { timeout: 90_000 }, async () => {
    const ctx = await setup("FAIL", { onchainStock: false });
    const budget = 2_000_000n;
    const q = await strategyService.quote(ctx.u.id, {
      strategyId: ctx.strategy.id,
      action: "enter",
      budgetInputRaw: budget,
    });
    expect(q.preparatory_swap).toBe(true);
    const quotedStockLeg = BigInt(q.maximum_inputs.find((a) => a.asset === ctx.stock.assetKey!)!.raw);
    // Move the pool against the quoted stock leg: small enough that the
    // preparatory swap still meets its minimum output, large enough that the
    // deposit cannot pull the quoted stock amount.
    await swapOnPool(ctx, 1_000_000_000n);
    const op = await strategyService.confirm(ctx.u.id, q.id, ctx.auth.id, `enter-${randomUUID()}`);
    const row = await drive(ctx, op.operation_id);
    expect(row.status).toBe("reverted");
    const position = await positionOf(ctx);
    expect(position.state).toBe("needs_review");
    // The preparatory swap delivered stock; that intermediate asset is retained as
    // visible owned inventory, not fictionally reversed.
    const stockLedger = await ledgerService.balance(acct.userStock(ctx.u.id, ctx.stock.id));
    expect(stockLedger).toBeGreaterThan(0n);
    expect(stockLedger).toBeLessThan(quotedStockLeg);
    const onchainStock = await ctx.handle.tokenBalance(ctx.token, ctx.ref.accountAddress);
    expect(onchainStock).toBe(stockLedger);
    // All reservations released: nothing stays locked after the failure.
    expect(await ledgerService.balance(acct.userReserved(ctx.u.id, "testnet"))).toBe(0n);
    expect(await ledgerService.balance(acct.userStockReserved(ctx.u.id, ctx.stock.id))).toBe(0n);
    expect(await ledgerService.balance(acct.userCash(ctx.u.id, "testnet"))).toBe(CASH - budget / 2n);
  });

  it("negativeReturnDoesNotEraseFeesOrInventIncome", { timeout: 90_000 }, async () => {
    const ctx = await setup("LOSS", { supply: 100_000_000n * 10n ** 18n });
    // A large relayer deposit makes the user a minority LP, so a stock-reserve loss
    // fixture produces a real principal loss on exit.
    await depositFromRelayer(ctx, 100_000_000_000n, 50_000_000n * 10n ** 18n);
    const settlementIn = 500_000n;
    const stockIn = 25n * 10n ** 18n;
    const { op } = await enterExplicit(ctx, settlementIn, stockIn);
    expect(op.status).toBe("finalized");
    const position = await positionOf(ctx);
    const principal = fromDbRaw(position.principalUsdc);
    // Trading activity accrues fees; a loss fixture then cuts the stock reserve.
    await swapOnPool(ctx, 1_000_000_000n);
    await ctx.handle.sendTx({
      to: ctx.pool,
      data: encodeFunctionData({ abi: hydrexPoolAbi, functionName: "applyLoss", args: [9_000n] }),
    });
    // The separate claim realizes the accrued fees while the position is still LP.
    const claimQ = await strategyService.quote(ctx.u.id, { positionId: position.id, action: "claim" });
    const claimOp = await strategyService.confirm(ctx.u.id, claimQ.id, ctx.auth.id, `claim-${randomUUID()}`);
    const claimRow = await drive(ctx, claimOp.operation_id);
    expect(claimRow.status).toBe("finalized");
    const receipts = await db.rewardReceipt.findMany();
    const settleReceipt = receipts.find((r) => r.asset === ctx.settlementKey);
    expect(settleReceipt).toBeDefined();
    const feeAmount = fromDbRaw(settleReceipt!.amountRaw);
    expect(feeAmount).toBeGreaterThan(0n);
    expect(settleReceipt!.source).toBe("hydrex_lp_fees");
    expect(await ledgerService.balance(acct.userEarnings(ctx.u.id, "testnet"))).toBe(feeAmount);
    // Exit at a loss: the loss is recorded, fees are not erased by it.
    const exitQ = await strategyService.quote(ctx.u.id, { positionId: position.id, action: "exit" });
    const exitOp = await strategyService.confirm(ctx.u.id, exitQ.id, ctx.auth.id, `exit-${randomUUID()}`);
    const exitRow = await drive(ctx, exitOp.operation_id);
    expect(exitRow.status).toBe("finalized");
    const afterExit = await positionOf(ctx);
    expect(afterExit.state).toBe("exited");
    expect(fromDbRaw(afterExit.valueUsdc!)).toBeLessThan(principal);
    // Income credited equals realized fees only; principal is never posted as income.
    expect(await ledgerService.balance(acct.userEarnings(ctx.u.id, "testnet"))).toBe(feeAmount);
    expect(feeAmount).toBeLessThan(principal);
    // The exit itself emitted no fee event: no extra receipt beyond the claim's.
    expect(await db.rewardReceipt.count()).toBe(receipts.length);
  });

  it("allocationCeilingsAreEnforcedUnderLocks", { timeout: 90_000 }, async () => {
    const ctx = await setup("CAP");
    // Per-allocation $100-equivalent fixture ceiling.
    const bigQ = await strategyService.quote(ctx.u.id, {
      strategyId: ctx.strategy.id,
      action: "enter",
      budgetInputRaw: 300_000_000n,
    });
    await expect(
      strategyService.confirm(ctx.u.id, bigQ.id, ctx.auth.id, `cap-big-${randomUUID()}`),
    ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    expect(await ledgerService.balance(acct.userReserved(ctx.u.id, "testnet"))).toBe(0n);
    expect(await db.strategyPosition.count({ where: { userId: ctx.u.id } })).toBe(0);

    // 20%-of-investment-value exposure cap: with $10 of available value the cap is $2.
    const u2 = await makeUserWithWallets();
    await testnetWalletService.ensureExecutionAccount(u2.id);
    await fundCash(u2.id, 10_000_000n, "testnet");
    const { dto: auth2 } = await authorizationService.create(
      u2.id,
      { scope: "strategies", strategyId: ctx.strategy.id, maxSpendUsdc: 1_000_000_000_000n, durationDays: 7, policyVersion: "test" },
      randomUUID(),
    );
    // A quote owned by another user is invisible (404), never confirmable.
    const foreignQ = await strategyService.quote(ctx.u.id, {
      strategyId: ctx.strategy.id,
      action: "enter",
      budgetInputRaw: 4_000_000n,
    });
    await expect(
      strategyService.confirm(u2.id, foreignQ.id, auth2.id, `cap-foreign-${randomUUID()}`),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const smallQ2 = await strategyService.quote(u2.id, {
      strategyId: ctx.strategy.id,
      action: "enter",
      budgetInputRaw: 4_000_000n,
    });
    await expect(
      strategyService.confirm(u2.id, smallQ2.id, auth2.id, `cap-small-${randomUUID()}`),
    ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    expect(await ledgerService.balance(acct.userReserved(u2.id, "testnet"))).toBe(0n);
  });
});
