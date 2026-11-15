import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { depositService } from "@/backend/services/deposits";
import { investmentService } from "@/backend/services/investments";
import { executionService, unpack } from "@/backend/services/execution";
import { kycService } from "@/backend/services/kyc";
import { simRamp } from "@/backend/services/simulator/ramp";
import { acct } from "@/backend/services/ledger/accounts";
import { ledgerService } from "@/backend/services/ledger";
import { onchainRegistry } from "@/backend/services/onchain/registry";
import "@/backend/services/onchain/providers";
import { publicClientFor, testnetService } from "@/backend/services/onchain/testnet";
import type { AssetAmount, ExecutionQuote } from "@/backend/services/onchain/types";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { ratesService } from "@/backend/services/rates";
import { ngnToUsd } from "@/utils/money";
import { setNow } from "../helpers/time";
import { db } from "@/server/db";
import { fromDbRaw } from "@/utils/asset-units";

import { oneTimeAuth, standingAuth } from "../helpers/authorizations";
import { useTestDatabase } from "../helpers/db";
import { fundCash, makeBankAccount, makeUserWithWallets, seedTreasury } from "../helpers/factories";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";
import { drainJobs } from "../helpers/worker";

useTestDatabase();

async function setup(symbol = "INV") {
  const handle = await testnet();
  const network = await ensureTestnetNetwork();
  const u = await makeUserWithWallets();
  const ref = await testnetWalletService.ensureExecutionAccount(u.id);
  const { stock, token } = await makeTestnetStock({ symbol, referencePriceMicroUsd: 2_000_000n });
  await handle.seedO1Pool(token, 1_000_000_000_000n, 500_000n * 10n ** 18n);
  await handle.mintSettlement(ref.accountAddress, 100_000_000n);
  await fundCash(u.id, 10_000_000n, "testnet");
  const block = await publicClientFor().getBlock({ blockTag: "latest" });
  setNow(new Date(Math.max(Date.now(), Number(block.timestamp) * 1000)).toISOString());
  ratesService.clearCache();
  await db.stock.update({ where: { id: stock.id }, data: { referenceAsOf: new Date() } });
  return { handle, network, u, ref, stock, token };
}

async function quoteBuy(
  ctx: Awaited<ReturnType<typeof setup>>,
  inputRaw: bigint,
  slippageBps?: number,
  allowPartialFill?: boolean,
) {
  return investmentService.quote(ctx.u.id, {
    stockId: ctx.stock.id,
    side: "buy",
    inputRaw,
    slippageBps,
    allowPartialFill,
  });
}

async function driveToFinal(ctx: Awaited<ReturnType<typeof setup>>, investmentId: string) {
  await investmentService.progress(investmentId);
  await ctx.handle.mine(3);
  await investmentService.progress(investmentId);
  await ctx.handle.mine(3);
  await investmentService.progress(investmentId);
}

describe("consent-bound investments on the local testnet", () => {
  it("binds the naira budget and acquisition FX to the accepted rate", async () => {
    const ctx = await setup("FXLOT");
    const display = await ratesService.display();
    const q = await investmentService.quote(ctx.u.id, { stockId: ctx.stock.id, side: "buy", budgetNgn: 150_000n });
    expect(BigInt(q.input_raw)).toBe(ngnToUsd(150_000n, display.depositRate, "floor"));
    expect(q.fx_rate?.kobo).toBe(display.depositRate.kobo.toString());
    const auth = await oneTimeAuth(ctx.u.id, q);
    const inv = await investmentService.confirm(ctx.u.id, q.id, auth.id, `fx-${randomUUID()}`);
    const spy = vi.spyOn(ratesService, "display").mockResolvedValue({ ...display, depositRate: { kobo: 999n, microUsd: 1n } });
    try {
      await driveToFinal(ctx, inv.id);
    } finally {
      spy.mockRestore();
    }
    const lot = await db.positionLot.findFirstOrThrow({ where: { userId: ctx.u.id } });
    expect(lot.fxRateKobo).toBe(display.depositRate.kobo * 1_000_000n / display.depositRate.microUsd);
  });

  it("reserves standing limits with the quote FX even if the rate feed later fails", async () => {
    const ctx = await setup("CAPFX");
    const q = await quoteBuy(ctx, 1_000_000n);
    const fx = q.fx_rate!;
    const cap = (1_000_000n * BigInt(fx.kobo) + BigInt(fx.micro_usd) - 1n) / BigInt(fx.micro_usd);
    const auth = await standingAuth(ctx.u.id, { stockIds: [ctx.stock.id] }, ["reinvest"], { maxActionNgn: cap, maxTotalNgn: cap });
    const spy = vi.spyOn(ratesService, "display").mockRejectedValue(new Error("feed unavailable"));
    try {
      const inv = await investmentService.confirm(ctx.u.id, q.id, auth.id, `cap-fx-${randomUUID()}`, { standingAction: "reinvest" });
      expect(inv.status).toBe("executing");
    } finally {
      spy.mockRestore();
    }
  });

  it("a standing total cap remains consumed after a successful fill", async () => {
    const ctx = await setup("SPENTCAP");
    const budget = 1_000_000n;
    const standing = await standingAuth(ctx.u.id, { stockIds: [ctx.stock.id] }, ["reinvest"], { maxActionNgn: budget, maxTotalNgn: budget });
    const firstQuote = await investmentService.quote(ctx.u.id, { stockId: ctx.stock.id, side: "buy", inputRaw: 1_000_000n, budgetNgn: budget });
    const first = await investmentService.confirm(ctx.u.id, firstQuote.id, standing.id, `spent-a-${randomUUID()}`, { standingAction: "reinvest" });
    await driveToFinal(ctx, first.id);
    expect((await investmentService.get(ctx.u.id, first.id))?.status).toBe("filled");
    const nextQuote = await investmentService.quote(ctx.u.id, { stockId: ctx.stock.id, side: "buy", inputRaw: 1_000_000n, budgetNgn: budget });
    await expect(investmentService.confirm(ctx.u.id, nextQuote.id, standing.id, `spent-b-${randomUUID()}`, { standingAction: "reinvest" })).rejects.toMatchObject({ code: "AUTHORIZATION_EXCEEDED" });
  });

  it("unrelated transfers cannot change a finalized fill observation", async () => {
    const ctx = await setup("DONATION");
    const quote = await quoteBuy(ctx, 1_000_000n);
    const auth = await oneTimeAuth(ctx.u.id, quote);
    const inv = await investmentService.confirm(ctx.u.id, quote.id, auth.id, `donation-${randomUUID()}`);
    await executionService.progress(inv.operation_id!);
    const before = await executionService.observe(inv.operation_id!);
    await ctx.handle.mintSettlement(ctx.ref.accountAddress, 50_000_000n);
    const after = await executionService.observe(inv.operation_id!);
    expect(after.actualInput).toEqual(before.actualInput);
    expect(after.actualOutput).toEqual(before.actualOutput);
    await driveToFinal(ctx, inv.id);
    const once = await db.positionLot.count({ where: { userId: ctx.u.id } });
    await investmentService.progress(inv.id);
    expect(await db.positionLot.count({ where: { userId: ctx.u.id } })).toBe(once);
  });

  it("twoRequestsReserveOnce: two concurrent 7,000,000 buys against 10,000,000 cash reserve once", { timeout: 60_000 }, async () => {
    const ctx = await setup("TWO");
    const q1 = await quoteBuy(ctx, 7_000_000n);
    const q2 = await quoteBuy(ctx, 7_000_000n);
    expect(q1.provider_id).toBe("o1");
    const auth1 = await oneTimeAuth(ctx.u.id, q1);
    const auth2 = await oneTimeAuth(ctx.u.id, q2);
    const results = await Promise.allSettled([
      investmentService.confirm(ctx.u.id, q1.id, auth1.id, `buy-a-${randomUUID()}`),
      investmentService.confirm(ctx.u.id, q2.id, auth2.id, `buy-b-${randomUUID()}`),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok.length).toBe(1);
    expect(failed.length).toBe(1);
    const rejected = failed[0];
    if (rejected?.status !== "rejected") throw new Error("expected one rejection");
    expect(String(rejected.reason)).toMatch(/Insufficient funds|AUTHORIZATION_EXCEEDED/);
    // Exactly 7,000,000 reserved; 3,000,000 cash remains before any fill.
    expect(await ledgerService.balance(acct.userCash(ctx.u.id, "testnet"))).toBe(3_000_000n);
    expect(await ledgerService.balance(acct.userReserved(ctx.u.id, "testnet"))).toBe(7_000_000n);
    const fulfilled = ok[0];
    if (fulfilled?.status !== "fulfilled") throw new Error("expected one fulfillment");
    const inv = fulfilled.value;
    await driveToFinal(ctx, inv.id);
    const row = await investmentService.get(ctx.u.id, inv.id);
    expect(row?.status).toBe("filled");
    expect(row?.amount_out).not.toBe("0");
    expect(await ledgerService.balance(acct.userReserved(ctx.u.id, "testnet"))).toBe(0n);
    expect(await ledgerService.balance(acct.userStock(ctx.u.id, ctx.stock.id))).toBe(BigInt(row!.amount_out!));
  });

  it("noProviderFallbackAfterBroadcast: the broadcast operation keeps its provider identity", { timeout: 60_000 }, async () => {
    const ctx = await setup("FALL");
    const q = await quoteBuy(ctx, 1_000_000n);
    const auth = await oneTimeAuth(ctx.u.id, q);
    const key = `buy-${randomUUID()}`;
    const inv = await investmentService.confirm(ctx.u.id, q.id, auth.id, key);
    expect(inv.operation_id).not.toBeNull();
    await investmentService.progress(inv.id);
    const op = await db.onchainOperation.findUniqueOrThrow({ where: { id: inv.operation_id! } });
    expect(op.status).toBe("broadcast");
    expect(op.providerId).toBe("o1");
    const opQuote = unpack((op.expected as { quote?: unknown }).quote) as ExecutionQuote;
    // A different provider context is rejected for this operation: no fallback.
    const foreign = await testnetService.defaultContext("hydrex", "replica-1.0.0", op.custodyProfileId);
    expect(() => onchainRegistry.spot("hydrex", { ...foreign, providerId: "hydrex" })).not.toThrow();
    await expect(
      Promise.resolve().then(() => onchainRegistry.spot("bankr", { ...opQuote.context, providerId: "o1" } as never)),
    ).rejects.toThrow();
    await ctx.handle.mine(3);
    await investmentService.progress(inv.id);
    const after = await db.onchainOperation.findUniqueOrThrow({ where: { id: inv.operation_id! } });
    expect(after.providerId).toBe("o1");
    expect(await db.onchainOperation.count({ where: { key: `inv-op:${key}` } })).toBe(1);
    const settled = await investmentService.get(ctx.u.id, inv.id);
    expect(settled?.status).toBe("filled");
  });

  it("expiredDepositQuoteLeavesCash: an expired quote leaves cash and needs_confirmation", { timeout: 60_000 }, async () => {
    const ctx = await setup("EXP");
    const q = await quoteBuy(ctx, 5_000_000n);
    const auth = await oneTimeAuth(ctx.u.id, q);
    await db.investmentQuote.update({ where: { id: q.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    const inv = await investmentService.confirm(ctx.u.id, q.id, auth.id, `buy-exp-${randomUUID()}`);
    expect(inv.status).toBe("needs_confirmation");
    expect(inv.operation_id).toBeNull();
    expect(await ledgerService.balance(acct.userCash(ctx.u.id, "testnet"))).toBe(10_000_000n);
    expect(await ledgerService.balance(acct.userReserved(ctx.u.id, "testnet"))).toBe(0n);
    const quoteRow = await db.investmentQuote.findUniqueOrThrow({ where: { id: q.id } });
    expect(quoteRow.consumedAt).toBeNull();
    expect(await db.onchainOperation.count({ where: { quoteId: q.id } })).toBe(0);
  });

  it("partialFillReleasesOnlyUnusedInput: partial fill settles actuals and consumes the quote", { timeout: 60_000 }, async () => {
    const ctx = await setup("PART");
    const q = await quoteBuy(ctx, 10_000_000n, 100, true);
    const auth = await oneTimeAuth(ctx.u.id, q);
    // The pool degrades after quoting: the router pulls only half the input.
    await ctx.handle.setO1PartialFillBps(5_000n);
    try {
      const inv = await investmentService.confirm(ctx.u.id, q.id, auth.id, `buy-part-${randomUUID()}`);
      await driveToFinal(ctx, inv.id);
      const row = await investmentService.get(ctx.u.id, inv.id);
      expect(row?.status).toBe("partial");
      const op = await db.onchainOperation.findUniqueOrThrow({ where: { id: inv.operation_id! } });
      const actual = unpack(op.actual) as { input?: AssetAmount; output?: AssetAmount };
      expect(actual.input!.raw).toBe(5_000_000n);
      expect(BigInt(row!.amount_out!)).toBe(actual.output!.raw);
      expect(BigInt(row!.amount_out!)).toBeLessThan(BigInt(q.expected_output_raw));
      // Only the actual input was pulled; the unused remainder returns to cash.
      expect(await ledgerService.balance(acct.userReserved(ctx.u.id, "testnet"))).toBe(0n);
      expect(await ledgerService.balance(acct.userCash(ctx.u.id, "testnet"))).toBe(5_000_000n);
      expect(await ledgerService.balance(acct.userStock(ctx.u.id, ctx.stock.id))).toBe(actual.output!.raw);
      // The quote is single-use: the remainder needs a fresh quote.
      expect((await db.investmentQuote.findUniqueOrThrow({ where: { id: q.id } })).consumedAt).not.toBeNull();
      const fresh = await quoteBuy(ctx, 1_000_000n);
      expect(fresh.id).not.toBe(q.id);
    } finally {
      await ctx.handle.setO1PartialFillBps(10_000n);
    }
  });

  it("partialFillWithoutConsentReverts: a smaller input fill cannot finalize without allowPartialFill", { timeout: 60_000 }, async () => {
    const ctx = await setup("PNF");
    const q = await quoteBuy(ctx, 10_000_000n, 100, false);
    const auth = await oneTimeAuth(ctx.u.id, q);
    await ctx.handle.setO1PartialFillBps(5_000n);
    try {
      const inv = await investmentService.confirm(ctx.u.id, q.id, auth.id, `buy-pnf-${randomUUID()}`);
      await driveToFinal(ctx, inv.id);
      await investmentService.progress(inv.id);
      const row = await investmentService.get(ctx.u.id, inv.id);
      expect(row?.status).toBe("failed");
      expect(row?.failure_reason).toBe("MIN_OUTPUT_BREACH");
      const op = await db.onchainOperation.findUniqueOrThrow({ where: { id: inv.operation_id! } });
      expect(op.status).toBe("reverted");
      // Nothing was pulled: the full reservation returns to cash.
      expect(await ledgerService.balance(acct.userReserved(ctx.u.id, "testnet"))).toBe(0n);
      expect(await ledgerService.balance(acct.userCash(ctx.u.id, "testnet"))).toBe(10_000_000n);
      expect(await ledgerService.balance(acct.userStock(ctx.u.id, ctx.stock.id))).toBe(0n);
    } finally {
      await ctx.handle.setO1PartialFillBps(10_000n);
    }
  });

  it("tradeCommitSurvivesCallbackCrash: one commit, one settlement journal after a crash and replay", { timeout: 60_000 }, async () => {
    const ctx = await setup("CRASH");
    const q = await quoteBuy(ctx, 2_000_000n);
    const auth = await oneTimeAuth(ctx.u.id, q);
    const key = `buy-crash-${randomUUID()}`;
    const inv = await investmentService.confirm(ctx.u.id, q.id, auth.id, key);
    await db.simFault.create({ data: { scope: "execution.broadcast", key: inv.operation_id! } });
    await expect(executionService.progress(inv.operation_id!)).rejects.toMatchObject({ code: "BROADCAST_INTERRUPTED" });
    // The commit survived: investment + operation exist exactly once.
    expect(await db.investment.count({ where: { key } })).toBe(1);
    expect(await db.onchainOperation.count({ where: { key: `inv-op:${key}` } })).toBe(1);
    await driveToFinal(ctx, inv.id);
    await investmentService.progress(inv.id);
    const row = await investmentService.get(ctx.u.id, inv.id);
    expect(row?.status).toBe("filled");
    expect(await db.ledgerJournal.count({ where: { key: `trade:${inv.id}:filled` } })).toBe(1);
    expect(await db.onchainOperation.count({ where: { key: `inv-op:${key}` } })).toBe(1);
  });

  it("standingCapCannotBeOverspent: cumulative naira reservations against a standing total cap are atomic", { timeout: 60_000 }, async () => {
    const ctx = await setup("CAP");
    const budget = 1_000_000n;
    const q1 = await investmentService.quote(ctx.u.id, {
      stockId: ctx.stock.id,
      side: "buy",
      inputRaw: 1_000_000n,
      budgetNgn: budget,
    });
    const q2 = await investmentService.quote(ctx.u.id, {
      stockId: ctx.stock.id,
      side: "buy",
      inputRaw: 1_000_000n,
      budgetNgn: budget,
    });
    // Total cap covers exactly one of the two actions.
    const standing = await standingAuth(ctx.u.id, { stockIds: [ctx.stock.id] }, ["reinvest"], {
      maxActionNgn: budget,
      maxTotalNgn: budget,
    });
    const results = await Promise.allSettled([
      investmentService.confirm(ctx.u.id, q1.id, standing.id, `cap-a-${randomUUID()}`, { standingAction: "reinvest" }),
      investmentService.confirm(ctx.u.id, q2.id, standing.id, `cap-b-${randomUUID()}`, { standingAction: "reinvest" }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok.length).toBe(1);
    expect(failed.length).toBe(1);
    expect((failed[0]!).reason).toMatchObject({ code: "AUTHORIZATION_EXCEEDED" });
    // Cash was reserved exactly once, by exactly one operation.
    expect(await ledgerService.balance(acct.userReserved(ctx.u.id, "testnet"))).toBe(BigInt(q1.input_raw));
    expect(await ledgerService.balance(acct.userCash(ctx.u.id, "testnet"))).toBe(10_000_000n - BigInt(q1.input_raw));
  });

  it("contractDeadlineCannotBeExtended: an expired signed instruction is never broadcast", { timeout: 60_000 }, async () => {
    const ctx = await setup("DED");
    const q = await quoteBuy(ctx, 2_000_000n);
    const auth = await oneTimeAuth(ctx.u.id, q);
    const key = `buy-ded-${randomUUID()}`;
    const inv = await investmentService.confirm(ctx.u.id, q.id, auth.id, key);
    const opId = inv.operation_id!;
    // Sign, then crash before broadcast: the exact signed payload is persisted.
    await db.simFault.create({ data: { scope: "execution.broadcast", key: opId } });
    await expect(executionService.progress(opId)).rejects.toMatchObject({ code: "BROADCAST_INTERRUPTED" });
    let op = await db.onchainOperation.findUniqueOrThrow({ where: { id: opId } });
    expect(op.status).toBe("signed");
    const signed = await db.signedPayload.findUniqueOrThrow({ where: { operationId: opId } });
    // Advance the chain clock past the quote expiry: the bound is never extended.
    const quoteRow = await db.investmentQuote.findUniqueOrThrow({ where: { id: q.id } });
    const latest = await publicClientFor().getBlock({ blockTag: "latest" });
    const target = Math.max(Number(latest.timestamp) + 1, Math.ceil(quoteRow.expiresAt.getTime() / 1000) + 1);
    await ctx.handle.advanceTime(target - Number(latest.timestamp));
    await expect(executionService.progress(opId)).rejects.toThrow("deadline has passed");
    op = await db.onchainOperation.findUniqueOrThrow({ where: { id: opId } });
    expect(op.status).toBe("signed");
    expect(op.txHash).toBe(signed.executeHash);
    const transaction = await (await import("@/backend/services/onchain/testnet")).rpcRequest(
      ctx.handle.url, "eth_getTransactionByHash", [signed.executeHash],
    );
    expect(transaction).toBeNull();
    expect(await ledgerService.balance(acct.userReserved(ctx.u.id, "testnet"))).toBe(2_000_000n);
    expect(await ledgerService.balance(acct.userCash(ctx.u.id, "testnet"))).toBe(8_000_000n);
    expect(await ledgerService.balance(acct.userStock(ctx.u.id, ctx.stock.id))).toBe(0n);
  });

  it("fundingReceiptCannotCreditCashTwice: webhook replay and the confirmed funding receipt credit cash once", { timeout: 90_000 }, async () => {
    const handle = await testnet();
    await ensureTestnetNetwork();
    const u = await makeUserWithWallets();
    await kycService.verify(u.id, { persona: "ada_tier2" });
    await makeBankAccount(u.id);
    const { stock } = await makeTestnetStock({ symbol: "FUND" });
    await seedTreasury("testnet", 1_000_000_000_000n);
    const { deposit } = await depositService.create(
      u.id,
      { ngn_amount: 1_500_000n, stock_id: stock.id },
      randomUUID(),
    );
    await simRamp.markCollectionPaid("yellowcard", deposit.id, {
      ngnAmount: 1_500_000n,
      senderName: "ADAEZE OBI",
    });
    for (let i = 0; i < 8; i += 1) {
      await drainJobs();
      await handle.mine(3);
    }
    const transfer = await db.chainTransfer.findFirstOrThrow({ where: { key: `fund:${deposit.id}` } });
    const funded = fromDbRaw(transfer.amount);
    // Replay the bank webhook and poll the confirmed funding receipt.
    await Promise.all(
      [depositService.progress(deposit.id), depositService.progress(deposit.id)].map((p) =>
        p.catch(() => undefined),
      ),
    );
    for (let i = 0; i < 4; i += 1) {
      await drainJobs();
      await handle.mine(3);
    }
    // Exactly one funding transfer and one settlement credit: the entitlement is
    // the settled amount once, never doubled by the replayed webhook/receipt.
    expect(await db.chainTransfer.count({ where: { key: `fund:${deposit.id}` } })).toBe(1);
    expect(await db.ledgerJournal.count({ where: { key: `deposit:${deposit.id}:received` } })).toBe(1);
    const cash = await ledgerService.balance(acct.userCash(u.id, "testnet"));
    const reserved = await ledgerService.balance(acct.userReserved(u.id, "testnet"));
    expect(cash + reserved).toBe(funded);
  });
});
