import { describe, expect, it } from "vitest";

import { db, withTx } from "@/server/db";
import { earningsService } from "@/backend/services/earnings";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { earningHarvested, openingBalance } from "@/backend/services/ledger/postings";

import { useTestDatabase } from "../helpers/db";
import { fundCash, makeStock, makeVerifiedUser } from "../helpers/factories";

useTestDatabase();

async function seedStockHolding(userId: string, stockId: string, quantity: bigint) {
  await withTx((tx) =>
    ledgerService.post(
      tx,
      openingBalance({ account: acct.userStock(userId, stockId), amount: quantity }),
    ),
  );
}

async function seedEarning(userId: string, stockId: string, week: string, amount: bigint, chain = "base") {
  await withTx(async (tx) => {
    await tx.earning.create({
      data: { userId, stockId, week, chain, amountUsdc: amount, harvestedAt: new Date() },
    });
    await ledgerService.post(
      tx,
      earningHarvested({ userId, stockId, week, chain, amount }),
    );
  });
}

describe("earnings", () => {
  it("records one entitlement per position-week across concurrent harvests", async () => {
    const holder = await makeVerifiedUser();
    const s = await makeStock();
    await seedStockHolding(holder.id, s.id, 5_000_000n);
    await Promise.all([
      earningsService.harvest("2026-11-09"),
      earningsService.harvest("2026-11-09"),
    ]);
    const rows = await db.earning.findMany({ where: { userId: holder.id } });
    expect(rows).toEqual([
      expect.objectContaining({ amountUsdc: 1_000_000n, week: "2026-11-09" }),
    ]);
    expect(await ledgerService.balance(acct.userEarnings(holder.id, "base"))).toBe(1_000_000n);
  });

  it("never earns on idle cash and keeps positions separate", async () => {
    const cashOnly = await makeVerifiedUser();
    await fundCash(cashOnly.id, 10_000_000n);
    const holder = await makeVerifiedUser();
    const s1 = await makeStock({ symbol: "TSTA" });
    const s2 = await makeStock({ symbol: "TSTB" });
    await seedStockHolding(holder.id, s1.id, 5_000_000n);
    await seedStockHolding(holder.id, s2.id, 2_000_000n);
    await earningsService.harvest("2026-11-09");
    expect(await db.earning.count({ where: { userId: cashOnly.id } })).toBe(0);
    expect(await db.earning.count({ where: { userId: holder.id } })).toBe(2);
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
