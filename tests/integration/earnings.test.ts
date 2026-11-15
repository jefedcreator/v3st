import { describe, expect, it } from "vitest";

import { db, withTx } from "@/server/db";
import { earningsService } from "@/backend/services/earnings";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { earningHarvested, openingBalance } from "@/backend/services/ledger/postings";
import { positionService } from "@/backend/services/positions";
import { stockActionService } from "@/backend/services/stocks/corporate-actions";

import { useTestDatabase } from "../helpers/db";
import { makeStock, makeVerifiedUser } from "../helpers/factories";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";

useTestDatabase();

async function seedStockHolding(userId: string, stockId: string, quantity: bigint) {
  await withTx((tx) =>
    ledgerService.post(
      tx,
      openingBalance({ account: acct.userStock(userId, stockId), amount: quantity }),
    ),
  );
}

async function seedEarning(userId: string, stockId: string | null, week: string, amount: bigint, chain = "base") {
  await withTx(async (tx) => {
    await tx.earning.create({
      data: { userId, stockId, week, chain, amountUsdc: amount, harvestedAt: new Date() },
    });
    await ledgerService.post(
      tx,
      earningHarvested({ userId, stockId: stockId ?? "legacy", week, chain, amount }),
    );
  });
}

describe("earnings", () => {
  it("holdingStockAlonePaysZero: harvest derives no income from a static holding", async () => {
    const holder = await makeVerifiedUser();
    const s = await makeStock();
    await seedStockHolding(holder.id, s.id, 5_000_000n);
    const journalsBefore = await db.ledgerJournal.count();
    const result = await earningsService.harvest("2026-11-09");
    expect(result.recorded).toBe(0);
    expect(await db.earning.count({ where: { userId: holder.id } })).toBe(0);
    expect(await ledgerService.balance(acct.userEarnings(holder.id, "base"))).toBe(0n);
    // No cash was minted: no new journal entries at all.
    expect(await db.ledgerJournal.count()).toBe(journalsBefore);
  });

  it("dividendMultiplierPaysNoCash: a corporate action changes valuation only", async () => {
    const handle = await testnet();
    const network = await ensureTestnetNetwork();
    const holder = await makeVerifiedUser();
    const { stock, token } = await makeTestnetStock({ symbol: "DIV", referencePriceMicroUsd: 100_000_000n });
    await seedStockHolding(holder.id, stock.id, 2n * 10n ** 18n);
    const journalsBefore = await db.ledgerJournal.count();
    // 2:1 split fixture: multiplier 2 on the token, share price halved.
    const past = Math.floor(Date.now() / 1000) - 1;
    await handle.scheduleMultiplier(token, 2n * 10n ** 18n, past);
    await handle.advanceTime(5);
    await handle.applyDueActions(token);
    await stockActionService.ingest(network.id, await handle.blockNumber());
    const result = await earningsService.harvest("2026-11-09");
    expect(result.recorded).toBe(0);
    expect(await db.earning.count({ where: { userId: holder.id } })).toBe(0);
    expect(await ledgerService.balance(acct.userEarnings(holder.id, "testnet"))).toBe(0n);
    expect(await db.ledgerJournal.count()).toBe(journalsBefore);
    // Valuation reflects the multiplier; no cash was paid.
    const positions = await positionService.list(holder.id);
    expect(positions[0]?.multiplier_wad).toBe((2n * 10n ** 18n).toString());
    expect(positions[0]?.value_usdc).toBe("400000000");
  });

  it("lists weeks newest first with sums and naira value", async () => {
    const u = await makeVerifiedUser();
    const s = await makeStock();
    await seedEarning(u.id, s.id, "2026-11-09", 1_000_000n);
    await seedEarning(u.id, s.id, "2026-11-16", 2_000_000n);
    const result = await earningsService.list(u.id, { page: 1, size: 10 });
    expect(result.total).toBe(2);
    expect(result.data[0]).toMatchObject({
      week: "2026-11-16",
      earned_usdc: "2000000",
      pending_usdc: "2000000",
      status: "pending",
      ngn_value: "310000",
    });
    expect(result.data[1]?.week).toBe("2026-11-09");
  });

  it("keeps legacy fixture rows under their explicit provenance", async () => {
    const u = await makeVerifiedUser();
    const s = await makeStock();
    await seedEarning(u.id, s.id, "2026-11-09", 1_000_000n);
    const row = await db.earning.findFirstOrThrow({ where: { userId: u.id } });
    expect(row.provenance).toBe("legacy_fixture");
    expect(row.receiptId).toBeNull();
  });

  it("validates preferences", async () => {
    const u = await makeVerifiedUser();
    const s = await makeStock();
    await expect(
      earningsService.setPreference(u.id, { mode: "reinvest" }),
    ).rejects.toMatchObject({ statusCode: 422, code: "STOCK_UNAVAILABLE" });
    await expect(
      earningsService.setPreference(u.id, { mode: "payout", stock_id: s.id }),
    ).rejects.toMatchObject({ statusCode: 422 });
    const payout = await earningsService.setPreference(u.id, { mode: "payout" });
    expect(payout).toMatchObject({
      mode: "payout",
      stock_id: null,
      minimum_payout_ngn: "200000",
      payout_fee_ngn: "10000",
    });
    const reinvest = await earningsService.setPreference(u.id, {
      mode: "reinvest",
      stock_id: s.id,
    });
    expect(reinvest).toMatchObject({ mode: "reinvest", stock_id: s.id });
  });
});
