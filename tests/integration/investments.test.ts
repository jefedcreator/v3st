import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { authorizationService } from "@/backend/services/authorizations";
import { investmentService } from "@/backend/services/investments";
import { executionService, unpack } from "@/backend/services/execution";
import { acct } from "@/backend/services/ledger/accounts";
import { ledgerService } from "@/backend/services/ledger";
import { onchainRegistry } from "@/backend/services/onchain/registry";
import "@/backend/services/onchain/providers";
import { settlementAssetKey, testnetService } from "@/backend/services/onchain/testnet";
import type { AssetAmount, ExecutionQuote } from "@/backend/services/onchain/types";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { db } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { fundCash, makeUserWithWallets } from "../helpers/factories";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";

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
  const { dto: auth } = await authorizationService.create(
    u.id,
    { scope: "investments", stockId: stock.id, maxSpendUsdc: 100_000_000n, durationDays: 7, policyVersion: "test" },
    randomUUID(),
  );
  return { handle, network, u, ref, stock, token, auth };
}

async function quoteBuy(ctx: Awaited<ReturnType<typeof setup>>, inputRaw: bigint, slippageBps?: number) {
  return investmentService.quote(ctx.u.id, {
    stockId: ctx.stock.id,
    side: "buy",
    inputRaw,
    slippageBps,
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
  it("twoRequestsReserveOnce: two concurrent 7,000,000 buys against 10,000,000 cash reserve once", { timeout: 60_000 }, async () => {
    const ctx = await setup("TWO");
    const q1 = await quoteBuy(ctx, 7_000_000n);
    const q2 = await quoteBuy(ctx, 7_000_000n);
    expect(q1.provider_id).toBe("o1");
    const results = await Promise.allSettled([
      investmentService.confirm(ctx.u.id, q1.id, ctx.auth.id, `buy-a-${randomUUID()}`),
      investmentService.confirm(ctx.u.id, q2.id, ctx.auth.id, `buy-b-${randomUUID()}`),
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
    const key = `buy-${randomUUID()}`;
    const inv = await investmentService.confirm(ctx.u.id, q.id, ctx.auth.id, key);
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
    await db.investmentQuote.update({ where: { id: q.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    const inv = await investmentService.confirm(ctx.u.id, q.id, ctx.auth.id, `buy-exp-${randomUUID()}`);
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
    const q = await quoteBuy(ctx, 10_000_000n, 6_000);
    // The pool degrades after quoting: the executed output is half the quote.
    await ctx.handle.setO1PartialFillBps(5_000n);
    try {
      const inv = await investmentService.confirm(ctx.u.id, q.id, ctx.auth.id, `buy-part-${randomUUID()}`);
      await driveToFinal(ctx, inv.id);
      const row = await investmentService.get(ctx.u.id, inv.id);
      expect(row?.status).toBe("partial");
      const op = await db.onchainOperation.findUniqueOrThrow({ where: { id: inv.operation_id! } });
      const actual = unpack(op.actual) as { input?: AssetAmount; output?: AssetAmount };
      expect(BigInt(row!.amount_out!)).toBe(actual.output!.raw);
      expect(BigInt(row!.amount_out!)).toBeLessThan(BigInt(q.expected_output_raw));
      // Only the actual input was spent; the reservation is fully released.
      expect(await ledgerService.balance(acct.userReserved(ctx.u.id, "testnet"))).toBe(0n);
      expect(await ledgerService.balance(acct.userCash(ctx.u.id, "testnet"))).toBe(0n);
      expect(await ledgerService.balance(acct.userStock(ctx.u.id, ctx.stock.id))).toBe(actual.output!.raw);
      // The quote is single-use: the remainder needs a fresh quote.
      expect((await db.investmentQuote.findUniqueOrThrow({ where: { id: q.id } })).consumedAt).not.toBeNull();
      const fresh = await quoteBuy(ctx, 1_000_000n);
      expect(fresh.id).not.toBe(q.id);
    } finally {
      await ctx.handle.setO1PartialFillBps(10_000n);
    }
  });

  it("tradeCommitSurvivesCallbackCrash: one commit, one settlement journal after a crash and replay", { timeout: 60_000 }, async () => {
    const ctx = await setup("CRASH");
    const q = await quoteBuy(ctx, 2_000_000n);
    const key = `buy-crash-${randomUUID()}`;
    const inv = await investmentService.confirm(ctx.u.id, q.id, ctx.auth.id, key);
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
});
