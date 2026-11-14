import { describe, expect, it, vi } from "vitest";

import { now } from "@/backend/clock";
import { db, withTx } from "@/server/db";
import { earningsService } from "@/backend/services/earnings";
import { earningsBatchService } from "@/backend/services/earnings/batch";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { earningHarvested } from "@/backend/services/ledger/postings";
import { scheduler } from "@/backend/services/jobs/schedule";
import { simVenue } from "@/backend/services/simulator/venue";
import { withdrawalService } from "@/backend/services/withdrawals";
import { walletService } from "@/backend/services/wallets";

import { useTestDatabase } from "../helpers/db";
import {
  creditFloat,
  makeBankAccount,
  makeStock,
  makeVerifiedUser,
  seedFloat,
  seedTreasury,
} from "../helpers/factories";
import { setNow } from "../helpers/time";
import { drainJobs } from "../helpers/worker";

useTestDatabase();

async function seedEarning(
  userId: string,
  stockId: string,
  week: string,
  amount: bigint,
  harvestedAt?: Date,
) {
  await withTx(async (tx) => {
    await tx.earning.create({
      data: {
        userId,
        stockId,
        week,
        chain: "base",
        amountUsdc: amount,
        harvestedAt: harvestedAt ?? new Date(),
      },
    });
    await ledgerService.post(
      tx,
      earningHarvested({ userId, stockId, week, chain: "base", amount }),
    );
  });
}

let stockCounter = 0;
async function eligibleUser(week: string, amount: bigint, harvestedAt?: Date) {
  const u = await makeVerifiedUser("ada_tier2");
  await makeBankAccount(u.id);
  await walletService.ensureUserWallets(u.id);
  await earningsService.setPreference(u.id, { mode: "payout" });
  stockCounter += 1;
  const s = await makeStock({ symbol: `STK${stockCounter}` });
  await seedEarning(u.id, s.id, week, amount, harvestedAt);
  return u;
}

describe("friday batch", () => {
  it("rolls over below N2,000 and pays once the sum qualifies under one weekly key", async () => {
    setNow("2026-11-20T08:00:00Z");
    await seedFloat("yellowcard", 1_000_000_000_000n);
    await seedTreasury("base", 1_000_000_000_000n);
    const u = await eligibleUser("2026-11-09", 1_290_322n);
    const r1 = await earningsBatchService.runBatch("2026-11-16", now());
    expect(r1.rolledOver).toBe(1);
    expect((await db.earning.findFirstOrThrow()).payoutOrderId).toBeNull();
    const earning = await db.earning.findFirstOrThrow();
    await seedEarning(u.id, earning.stockId!, "2026-11-16", 1n);
    const r2 = await earningsBatchService.runBatch("2026-11-16", now());
    expect(r2.paid).toBe(1);
    expect(await db.rampOrder.findMany({ where: { kind: "earnings_payout" } })).toEqual([
      expect.objectContaining({
        idempotencyKey: `earnings:${u.id}:2026-11-16`,
        ngnAmount: 200_000n,
      }),
    ]);
    expect(await db.earning.count({ where: { payoutOrderId: { not: null } } })).toBe(2);
  });

  it("creates one payout per user per week under two concurrent batch runs", async () => {
    setNow("2026-11-20T08:00:00Z");
    await seedFloat("yellowcard", 1_000_000_000_000n);
    await seedTreasury("base", 1_000_000_000_000n);
    const u1 = await eligibleUser("2026-11-16", 2_000_000n);
    const u2 = await eligibleUser("2026-11-16", 3_000_000n);
    await Promise.all([
      earningsBatchService.runBatch("2026-11-16", now()),
      earningsBatchService.runBatch("2026-11-16", now()),
    ]);
    const orders = await db.rampOrder.findMany({ where: { kind: "earnings_payout" } });
    expect(orders).toHaveLength(2);
    expect(orders.map((o) => o.userId).sort()).toEqual([u1.id, u2.id].sort());
  });

  it("resumes a crashed batch without paying anyone twice", async () => {
    setNow("2026-11-20T08:00:00Z");
    await seedFloat("yellowcard", 1_000_000_000_000n);
    await seedTreasury("base", 1_000_000_000_000n);
    for (let i = 0; i < 5; i++) {
      await eligibleUser("2026-11-16", 2_000_000n, new Date(Date.now() + i * 1000));
    }
    const real = withdrawalService.createEarningsPayout.bind(withdrawalService);
    let count = 0;
    vi.spyOn(withdrawalService, "createEarningsPayout").mockImplementation(async (tx, i) => {
      count += 1;
      if (count === 4) throw new Error("crash");
      return real(tx, i);
    });
    try {
      await expect(earningsBatchService.runBatch("2026-11-16", now())).rejects.toThrow("crash");
      const r = await earningsBatchService.runBatch("2026-11-16", now());
      expect(r.paid).toBe(2);
      const orders = await db.rampOrder.findMany({ where: { kind: "earnings_payout" } });
      expect(orders).toHaveLength(5);
      expect(new Set(orders.map((o) => o.userId)).size).toBe(5);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("stops at the first unfundable payout and keeps oldest-first order", async () => {
    setNow("2026-11-20T08:00:00Z");
    await seedTreasury("base", 1_000_000_000_000n);
    await seedFloat("yellowcard", 6_500_000n);
    for (let i = 0; i < 3; i++) {
      await eligibleUser("2026-11-16", 3_000_000n, new Date(Date.now() + i * 60_000));
    }
    const r1 = await earningsBatchService.runBatch("2026-11-16", now());
    expect(r1.paid).toBe(2);
    expect(r1.stoppedForFloat).toBe(true);
    expect(
      await db.operationalAlert.count({
        where: {
          kind: "float.short",
          resolvedAt: null,
          dedupeKey: "float.short:friday:2026-11-16",
        },
      }),
    ).toBe(1);
    await creditFloat("yellowcard", 10_000_000_000n);
    const r2 = await earningsBatchService.runBatch("2026-11-16", now());
    expect(r2.paid).toBe(1);
    expect(await db.rampOrder.count({ where: { kind: "earnings_payout" } })).toBe(3);
  });

  it("reinvests without a fee", async () => {
    setNow("2026-11-20T08:00:00Z");
    await seedFloat("yellowcard", 1_000_000_000_000n);
    const u = await makeVerifiedUser("ada_tier2");
    await makeBankAccount(u.id);
    await walletService.ensureUserWallets(u.id);
    const s = await makeStock();
    await earningsService.setPreference(u.id, { mode: "reinvest", stock_id: s.id });
    await seedEarning(u.id, s.id, "2026-11-16", 5_000_000n);
    const r = await earningsBatchService.runBatch("2026-11-16", now());
    expect(r.reinvested).toBe(1);
    const trade = await db.tradeOrder.findUniqueOrThrow({
      where: { key: `reinvest:${u.id}:2026-11-16` },
    });
    expect(trade).toMatchObject({ purpose: "reinvest", fundsSource: "earnings" });
    await drainJobs();
    expect((await db.tradeOrder.findUniqueOrThrow({ where: { id: trade.id } })).status).toBe(
      "filled",
    );
    expect(await db.earning.findFirstOrThrow({ where: { userId: u.id } })).toMatchObject({
      reinvestTradeId: trade.id,
    });
  });

  it("restores earnings and unlinks when a reinvest reverts", async () => {
    setNow("2026-11-20T08:00:00Z");
    await seedFloat("yellowcard", 1_000_000_000_000n);
    const u = await makeVerifiedUser("tunde_tier1");
    await makeBankAccount(u.id, "0234567891");
    await walletService.ensureUserWallets(u.id);
    const s = await makeStock();
    await earningsService.setPreference(u.id, { mode: "reinvest", stock_id: s.id });
    await seedEarning(u.id, s.id, "2026-11-16", 4_000_000n);
    await simVenue.addFault("swap", `reinvest:${u.id}:2026-11-16`);
    const r = await earningsBatchService.runBatch("2026-11-16", now());
    expect(r.reinvested).toBe(1);
    await drainJobs();
    const trade = await db.tradeOrder.findUniqueOrThrow({
      where: { key: `reinvest:${u.id}:2026-11-16` },
    });
    expect(trade.status).toBe("failed");
    expect(await ledgerService.balance(acct.userEarnings(u.id, "base"))).toBe(4_000_000n);
    expect(await db.earning.findFirstOrThrow({ where: { userId: u.id } })).toMatchObject({
      reinvestTradeId: null,
    });
  });

  it("skips users who have not chosen without touching their earnings", async () => {
    setNow("2026-11-20T08:00:00Z");
    await seedFloat("yellowcard", 1_000_000_000_000n);
    const u = await makeVerifiedUser();
    const s = await makeStock();
    await seedEarning(u.id, s.id, "2026-11-16", 5_000_000n);
    const r = await earningsBatchService.runBatch("2026-11-16", now());
    expect(r.skipped.needs_choice).toBe(1);
    expect(await db.earning.findFirstOrThrow({ where: { userId: u.id } })).toMatchObject({
      payoutOrderId: null,
      reinvestTradeId: null,
    });
  });

  it("grossMinimumIs200000Kobo: 199,999 kobo rolls over and 200,000 qualifies", async () => {
    setNow("2026-11-20T08:00:00Z");
    await seedFloat("yellowcard", 1_000_000_000_000n);
    await seedTreasury("base", 1_000_000_000_000n);
    // At the 155,000 kobo/USD payout rate: 1,290,322 micro-USD floors to 199,999
    // kobo (rolls over) and 1,290,323 floors to 200,000 kobo (qualifies).
    await eligibleUser("2026-11-16", 1_290_322n);
    const u2 = await eligibleUser("2026-11-16", 1_290_323n);
    const r = await earningsBatchService.runBatch("2026-11-16", now());
    expect(r.rolledOver).toBe(1);
    expect(r.paid).toBe(1);
    const orders = await db.rampOrder.findMany({ where: { kind: "earnings_payout" } });
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ userId: u2.id, ngnAmount: 200_000n });
  });

  it("pays from the Friday 08:00 Lagos schedule", async () => {
    setNow("2026-11-13T07:00:00Z");
    await scheduler.tick(now());
    const job = await db.job.findFirst({
      where: { kind: "earnings.payout_batch", subjectId: "2026-11-09" },
    });
    expect(job).not.toBeNull();
  });

  it("tops up the float on precheck when the batch would exceed it", async () => {
    setNow("2026-11-19T23:00:00Z");
    await seedTreasury("base", 1_000_000_000_000n);
    await seedFloat("yellowcard", 10_000_000_000n);
    await eligibleUser("2026-11-16", 20_000_000_000n);
    const result = await earningsBatchService.precheck("2026-11-16");
    expect(result.requiredUsd).toBe(20_000_000_000n);
    expect(await db.treasuryOperation.count({ where: { kind: "float_topup" } })).toBe(1);
  });
});
