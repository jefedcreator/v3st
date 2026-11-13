import { describe, expect, it } from "vitest";

import { now } from "@/backend/clock";
import { controlsService } from "@/backend/services/controls";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { openingBalance } from "@/backend/services/ledger/postings";
import { simVenue } from "@/backend/services/simulator/venue";
import { tradeService } from "@/backend/services/trades";
import { db, withTx } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { fundCash, makeStock, makeUserWithWallets } from "../helpers/factories";
import { setNow } from "../helpers/time";
import { drainJobs } from "../helpers/worker";

useTestDatabase();

describe("trades", () => {
  it("buys through the best route and settles holdings", async () => {
    const u = await makeUserWithWallets();
    const s = await makeStock();
    await fundCash(u.id, 10_000_000n);
    const t = await withTx((tx) =>
      tradeService.createBuy(tx, {
        key: "buy:1",
        userId: u.id,
        stockId: s.id,
        amountIn: 10_000_000n,
        purpose: "deposit_buy",
        fundsSource: "cash",
      }),
    );
    await drainJobs();
    expect(await db.tradeOrder.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({
      status: "filled",
      amountOut: 5_000_000n,
    });
    expect(await ledgerService.balance(acct.userStock(u.id, s.id))).toBe(5_000_000n);
    expect(await ledgerService.balance(acct.userCash(u.id, "base"))).toBe(0n);
  });

  it("does not submit a swap that breaches the slippage cap and restores the cash", async () => {
    const u = await makeUserWithWallets();
    const s = await makeStock();
    await fundCash(u.id, 10_000_000n);
    await simVenue.addFault("swap_impact", "buy:2");
    const t = await withTx((tx) =>
      tradeService.createBuy(tx, {
        key: "buy:2",
        userId: u.id,
        stockId: s.id,
        amountIn: 10_000_000n,
        purpose: "deposit_buy",
        fundsSource: "cash",
      }),
    );
    await tradeService.progress(t.id);
    const failed = await db.tradeOrder.findUniqueOrThrow({ where: { id: t.id } });
    expect(failed.status).toBe("failed");
    expect(failed.failureReason).toBe("SLIPPAGE");
    expect(await db.simSwap.count()).toBe(0);
    expect(await ledgerService.balance(acct.userCash(u.id, "base"))).toBe(10_000_000n);
  });

  it("retains cash after a reverted buy and retries once per key", async () => {
    const start = now();
    setNow(start.toISOString());
    const u = await makeUserWithWallets();
    const s = await makeStock();
    await fundCash(u.id, 10_000_000n);
    await simVenue.addFault("swap", "buy:3");
    const t = await withTx((tx) =>
      tradeService.createBuy(tx, {
        key: "buy:3",
        userId: u.id,
        stockId: s.id,
        amountIn: 10_000_000n,
        purpose: "deposit_buy",
        fundsSource: "cash",
      }),
    );
    await tradeService.progress(t.id);
    setNow(new Date(start.getTime() + 5_000).toISOString());
    await tradeService.progress(t.id);
    const failed = await db.tradeOrder.findUniqueOrThrow({ where: { id: t.id } });
    expect(failed.status).toBe("failed");
    expect(failed.failureReason).toBe("REVERTED");
    expect(await ledgerService.balance(acct.userCash(u.id, "base"))).toBe(10_000_000n);

    const r1 = await tradeService.retry(u.id, t.id, "k1");
    const r2 = await tradeService.retry(u.id, t.id, "k1");
    expect(r1.id).toBe(r2.id);
    await drainJobs();
    expect(
      await db.tradeOrder.findUniqueOrThrow({ where: { id: r1.id } }),
    ).toMatchObject({ status: "filled", amountOut: 5_000_000n });
  });

  it("never buys twice when progress repeats after a fill", async () => {
    const u = await makeUserWithWallets();
    const s = await makeStock();
    await fundCash(u.id, 10_000_000n);
    const t = await withTx((tx) =>
      tradeService.createBuy(tx, {
        key: "buy:4",
        userId: u.id,
        stockId: s.id,
        amountIn: 10_000_000n,
        purpose: "deposit_buy",
        fundsSource: "cash",
      }),
    );
    await drainJobs();
    await tradeService.progress(t.id);
    await tradeService.progress(t.id);
    await tradeService.progress(t.id);
    expect(
      await db.ledgerJournal.count({ where: { key: `trade:${t.id}:filled` } }),
    ).toBe(1);
    expect(await db.simSwap.count({ where: { key: "buy:4" } })).toBe(1);
  });

  it("rejects a retry without enough cash", async () => {
    const start = now();
    setNow(start.toISOString());
    const u = await makeUserWithWallets();
    const s = await makeStock();
    await fundCash(u.id, 20_000_000n);
    await simVenue.addFault("swap", "buy:f");
    const failedBuy = await withTx((tx) =>
      tradeService.createBuy(tx, {
        key: "buy:f",
        userId: u.id,
        stockId: s.id,
        amountIn: 10_000_000n,
        purpose: "deposit_buy",
        fundsSource: "cash",
      }),
    );
    await tradeService.progress(failedBuy.id);
    setNow(new Date(start.getTime() + 5_000).toISOString());
    await tradeService.progress(failedBuy.id);
    expect(
      (await db.tradeOrder.findUniqueOrThrow({ where: { id: failedBuy.id } })).status,
    ).toBe("failed");
    const okBuy = await withTx((tx) =>
      tradeService.createBuy(tx, {
        key: "buy:ok",
        userId: u.id,
        stockId: s.id,
        amountIn: 20_000_000n,
        purpose: "deposit_buy",
        fundsSource: "cash",
      }),
    );
    await drainJobs();
    expect((await db.tradeOrder.findUniqueOrThrow({ where: { id: okBuy.id } })).status).toBe(
      "filled",
    );
    await expect(tradeService.retry(u.id, failedBuy.id, "k2")).rejects.toMatchObject({
      code: "INSUFFICIENT_FUNDS",
    });
  });

  it("keeps selling available while deposits are paused", async () => {
    const u = await makeUserWithWallets();
    const s = await makeStock();
    await withTx((tx) =>
      ledgerService.post(
        tx,
        openingBalance({ account: acct.userStock(u.id, s.id), amount: 5_000_000n }),
      ),
    );
    await controlsService.set(db, {
      scope: "deposits",
      paused: true,
      reason: "test pause",
      actorId: null,
    });
    const order = await db.rampOrder.create({
      data: {
        userId: u.id,
        kind: "withdrawal",
        direction: "out",
        provider: "yellowcard",
        providerMode: "simulated",
        settlementModel: "partner_float",
        status: "created",
        idempotencyKey: "idem-sell-1",
        requestHash: "test",
        ngnAmount: 15_500_000n,
      },
    });
    const t = await withTx((tx) =>
      tradeService.createSell(tx, {
        key: "sell:1",
        userId: u.id,
        stockId: s.id,
        quantity: 5_000_000n,
        minAmountOut: 0n,
        orderId: order.id,
      }),
    );
    await drainJobs();
    expect(await db.tradeOrder.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({
      status: "filled",
      amountOut: 10_000_000n,
    });
    expect(await ledgerService.balance(acct.userCash(u.id, "base"))).toBe(10_000_000n);
  });
});
