import { describe, expect, it } from "vitest";

import { POST as previewPOST } from "@/app/api/v1/app/orders/preview/route";
import { POST as ordersPOST } from "@/app/api/v1/app/orders/route";
import { GET as orderGET } from "@/app/api/v1/app/orders/[id]/route";
import { POST as betaCompletePOST } from "@/app/api/v1/app/beta/deposits/[id]/complete/route";
import { POST as depositsPOST } from "@/app/api/v1/app/cash/deposits/route";
import { GET as cashGET } from "@/app/api/v1/app/cash/route";
import { POST as onchainScenariosPOST } from "@/app/api/v1/beta/onchain-scenarios/route";
import type { AppOrderDto, AppOrderPreviewDto } from "@/backend/services/app/orders";
import { customerOrderService } from "@/backend/services/customer-orders";
import { now } from "@/backend/clock";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { publicClientFor } from "@/backend/services/onchain/testnet";
import { ratesService } from "@/backend/services/rates";
import { db, lockRows, withTx } from "@/server/db";
import { sharesMicroOf } from "@/backend/services/app/format";
import { sha256Hex } from "@/utils";

import { callAppRoute, ORIGIN, readyCustomer } from "../helpers/app";
import { useTestDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { seedTreasury } from "../helpers/factories";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";
import { setNow } from "../helpers/time";
import { drainJobs } from "../helpers/worker";

useTestDatabase();

function dataOf<T>(json: unknown): T {
  return (json as { data: T }).data;
}

async function touchReference(stockId: string) {
  await db.stock.update({
    where: { id: stockId },
    data: { referenceAsOf: now(), referencePriceMicroUsd: 2_000_000n, referenceBasis: "share_price" },
  });
}

async function setupWorld(email: string) {
  const handle = await testnet();
  await ensureTestnetNetwork();
  await seedTreasury("testnet", 1_000_000_000_000n);
  const { stock, token } = await makeTestnetStock({
    symbol: "TSTA",
    referencePriceMicroUsd: 2_000_000n,
  });
  await handle.seedO1Pool(token, 1_000_000_000_000n, 500_000n * 10n ** 18n);
  await db.stock.update({ where: { id: stock.id }, data: { displayTicker: "TSTA" } });
  const block = await publicClientFor().getBlock({ blockTag: "latest" });
  setNow(new Date(Math.max(Date.now(), Number(block.timestamp) * 1000)).toISOString());
  ratesService.clearCache();
  await touchReference(stock.id);
  const customer = await readyCustomer(email);
  return { handle, stock, ...customer };
}

async function addMoneyAndComplete(cookie: string, amountKobo: string, key: string) {
  const res = await callAppRoute(depositsPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/cash/deposits`,
    cookie,
    headers: { "idempotency-key": key },
    body: { amount_kobo: amountKobo },
  });
  expect(res.status).toBe(201);
  const id = dataOf<{ id: string }>(res.json).id;
  const complete = await callAppRoute(betaCompletePOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/beta/deposits/${id}/complete`,
    cookie,
    params: { id },
  });
  expect(complete.status).toBe(200);
  const handle = await testnet();
  for (let i = 0; i < 8; i += 1) {
    await drainJobs();
    await handle.mine(3);
  }
  return id;
}

async function previewOrder(cookie: string, stockId: string, body: Record<string, unknown>) {
  await touchReference(stockId);
  return callAppRoute(previewPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/orders/preview`,
    cookie,
    body: { stock_id: stockId, ...body },
  });
}

function placeWith(cookie: string, previewId: string, key: string, pin: string) {
  return callAppRoute(ordersPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/orders`,
    cookie,
    headers: { "idempotency-key": key },
    body: { preview_id: previewId, pin },
  });
}

async function driveToFinal(handle: Awaited<ReturnType<typeof testnet>>, orderId: string, cookie: string) {
  for (let i = 0; i < 12; i += 1) {
    await drainJobs();
    await handle.mine(3);
    const res = await callAppRoute(orderGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/orders/${orderId}`,
      cookie,
      params: { id: orderId },
    });
    const status = dataOf<AppOrderDto>(res.json).status;
    if (["completed", "failed", "cancelled", "expired"].includes(status)) return;
  }
}

describe("customer orders: preview and immediate buy or sell", () => {
  it("buys now with cash", async () => {
    const { cookie, handle, stock } = await setupWorld("buy@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "ord-dep-buy-1");

    const preview = await previewOrder(cookie, stock.id, { side: "buy", amount_kobo: "2000000" });
    expect(preview.status).toBe(200);
    const p = dataOf<AppOrderPreviewDto>(preview.json);
    expect(p.executes).toBe("now");
    expect(p.pay_with).toBe("cash");
    expect(p.fees.map((f) => f.label)).toEqual(["V3ST fee", "Currency conversion", "Trading fee"]);
    expect(BigInt(p.shares_micro)).toBeGreaterThan(0n);
    expect(BigInt(p.price_kobo)).toBeGreaterThan(0n);

    const placed = await placeWith(cookie, p.preview_id, "ord-key-buy-1", "1357");
    expect(placed.status).toBe(201);
    const order = dataOf<AppOrderDto>(placed.json);
    expect(order.status).toBe("processing");
    expect(order.title).toBe("Buying Test Stock A");
    expect(order.detail).toBe("This usually takes under a minute.");
    expect(order.can_cancel).toBe(false);
    expect(order.timeline.map((t) => t.label)).toEqual(["Order placed", "Buying shares", "Done"]);

    await driveToFinal(handle, order.id, cookie);
    const done = await callAppRoute(orderGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/orders/${order.id}`,
      cookie,
      params: { id: order.id },
    });
    const d = dataOf<AppOrderDto>(done.json);
    expect(d.status).toBe("completed");
    expect(d.title).toBe("Bought Test Stock A");
    expect(BigInt(d.shares_micro!)).toBeGreaterThan(0n);
    expect(d.timeline.find((t) => t.label === "Done")?.done).toBe(true);
  });

  it("sells everything now", async () => {
    const { cookie, userId, handle, stock } = await setupWorld("sell@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "ord-dep-sell-1");
    const buyPreview = await previewOrder(cookie, stock.id, { side: "buy", amount_kobo: "2000000" });
    const bp = dataOf<AppOrderPreviewDto>(buyPreview.json);
    const buy = await placeWith(cookie, bp.preview_id, "ord-key-sell-buy", "1357");
    expect(buy.status).toBe(201);
    await driveToFinal(handle, dataOf<AppOrderDto>(buy.json).id, cookie);

    const cashBefore = dataOf<{ available_kobo: string | null }>(
      (await callAppRoute(cashGET, { method: "GET", url: `${ORIGIN}/api/v1/app/cash`, cookie })).json,
    ).available_kobo;

    const sellPreview = await previewOrder(cookie, stock.id, { side: "sell", sell_all: true });
    expect(sellPreview.status).toBe(200);
    const sp = dataOf<AppOrderPreviewDto>(sellPreview.json);
    expect(sp.executes).toBe("now");
    expect(sp.pay_with).toBeNull();
    const holding = await ledgerService.balance(acct.userStock(userId, stock.id));
    expect(holding).toBeGreaterThan(0n);
    expect(BigInt(sp.shares_micro)).toBe(sharesMicroOf(holding, stock.decimals));
    expect(sp.you_receive_kobo).not.toBeNull();

    const sell = await placeWith(cookie, sp.preview_id, "ord-key-sell-1", "1357");
    expect(sell.status).toBe(201);
    const sellOrder = dataOf<AppOrderDto>(sell.json);
    expect(sellOrder.status).toBe("processing");
    await driveToFinal(handle, sellOrder.id, cookie);
    const done = await callAppRoute(orderGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/orders/${sellOrder.id}`,
      cookie,
      params: { id: sellOrder.id },
    });
    const d = dataOf<AppOrderDto>(done.json);
    expect(d.status).toBe("completed");
    expect(d.title).toBe("Sold Test Stock A");

    const cashAfter = dataOf<{ available_kobo: string | null }>(
      (await callAppRoute(cashGET, { method: "GET", url: `${ORIGIN}/api/v1/app/cash`, cookie })).json,
    ).available_kobo;
    expect(BigInt(cashAfter!)).toBeGreaterThan(BigInt(cashBefore!));
  });

  it("expires an unused preview", async () => {
    const { cookie, stock } = await setupWorld("expire@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "ord-dep-exp-1");
    const preview = await previewOrder(cookie, stock.id, { side: "buy", amount_kobo: "2000000" });
    const p = dataOf<AppOrderPreviewDto>(preview.json);
    setNow(new Date(now().getTime() + 31_000).toISOString());
    const placed = await placeWith(cookie, p.preview_id, "ord-key-exp-1", "1357");
    expect(placed.status).toBe(409);
    expect((placed.json as { code: string }).code).toBe("PRICE_CHANGED");
  });

  it("keeps the preview after a wrong PIN", async () => {
    const { cookie, stock } = await setupWorld("pin@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "ord-dep-pin-1");
    const preview = await previewOrder(cookie, stock.id, { side: "buy", amount_kobo: "2000000" });
    const p = dataOf<AppOrderPreviewDto>(preview.json);
    const wrong = await placeWith(cookie, p.preview_id, "ord-key-pin-1", "9999");
    expect(wrong.status).toBe(422);
    expect((wrong.json as { code: string }).code).toBe("PIN_INCORRECT");
    const right = await placeWith(cookie, p.preview_id, "ord-key-pin-1", "1357");
    expect(right.status).toBe(201);
    expect(dataOf<AppOrderDto>(right.json).status).toBe("processing");
  });

  it("creates one order for a repeated confirm", async () => {
    const { cookie, userId, stock } = await setupWorld("doubletap@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "ord-dep-dt-1");
    const preview = await previewOrder(cookie, stock.id, { side: "buy", amount_kobo: "2000000" });
    const p = dataOf<AppOrderPreviewDto>(preview.json);
    const key = "double-tap-0001";
    const [a, b] = await Promise.all([
      placeWith(cookie, p.preview_id, key, "1357"),
      placeWith(cookie, p.preview_id, key, "1357"),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(dataOf<AppOrderDto>(a.json).id).toBe(dataOf<AppOrderDto>(b.json).id);
    expect(
      await db.investment.count({ where: { key: { startsWith: `app-order:${userId}:${key}` } } }),
    ).toBe(1);
    const replay = await placeWith(cookie, p.preview_id, key, "9999");
    expect(replay.status).toBe(200);
    expect(dataOf<AppOrderDto>(replay.json).id).toBe(dataOf<AppOrderDto>(a.json).id);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).pinFailedAttempts).toBe(0);
  });

  it("finishes an order interrupted before its investment", async () => {
    const { cookie, userId, stock } = await setupWorld("resume@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "ord-dep-res-1");
    const preview = await previewOrder(cookie, stock.id, { side: "buy", amount_kobo: "2000000" });
    const p = dataOf<AppOrderPreviewDto>(preview.json);
    const key = "resume-key-1";
    const orderKey = `app-order:${userId}:${key}`;
    // Replicate placeNow step 1: an executing order whose confirm never ran.
    const order = await withTx(async (tx) => {
      await lockRows(tx, "customer_order_previews", [p.preview_id]);
      const previewRow = await tx.customerOrderPreview.findUniqueOrThrow({ where: { id: p.preview_id } });
      const created = await tx.customerOrder.create({
        data: {
          userId,
          key: orderKey,
          requestHash: sha256Hex(p.preview_id),
          previewId: previewRow.id,
          stockId: previewRow.stockId,
          side: previewRow.side,
          funding: previewRow.funding,
          status: "executing",
          amountKobo: previewRow.amountKobo,
          budgetMicroUsd: previewRow.budgetMicroUsd,
          quantityRaw: previewRow.quantityRaw,
          limitPriceMicroUsd: previewRow.limitPriceMicroUsd,
          rateKobo: previewRow.rateKobo,
          rateMicroUsd: previewRow.rateMicroUsd,
          expiresAt: previewRow.expiresAt,
        },
      });
      await tx.customerOrderPreview.update({ where: { id: previewRow.id }, data: { consumedAt: now() } });
      return created;
    });
    await customerOrderService.resumeNow(order.id);
    await customerOrderService.resumeNow(order.id);
    expect(await db.investment.count({ where: { key: `${orderKey}:investment` } })).toBe(1);
    const reloaded = await db.customerOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(reloaded.investmentId).not.toBeNull();
  });

  it("explains a failed buy without internal words", async () => {
    const { cookie, userId, handle, stock } = await setupWorld("fail@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "ord-dep-fail-1");
    const preview = await previewOrder(cookie, stock.id, { side: "buy", amount_kobo: "2000000" });
    const p = dataOf<AppOrderPreviewDto>(preview.json);
    const placed = await placeWith(cookie, p.preview_id, "ord-key-fail-1", "1357");
    expect(placed.status).toBe(201);
    const investment = await db.investment.findUniqueOrThrow({
      where: { key: `app-order:${userId}:ord-key-fail-1:investment` },
    });
    expect(investment.operationId).not.toBeNull();
    const scen = await callRoute(onchainScenariosPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/beta/onchain-scenarios`,
      cookie,
      headers: { "idempotency-key": "scen-fail-1" },
      body: { operation_id: investment.operationId, scenario: "partial_fill" },
    });
    expect(scen.status).toBe(200);
    try {
      for (let i = 0; i < 12; i += 1) {
        await drainJobs();
        await handle.mine(3);
      }
    } finally {
      await handle.setO1PartialFillBps(10_000n);
    }
    const order = dataOf<AppOrderDto>(placed.json);
    const res = await callAppRoute(orderGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/orders/${order.id}`,
      cookie,
      params: { id: order.id },
    });
    const d = dataOf<AppOrderDto>(res.json);
    expect(d.status).toBe("failed");
    expect(d.title).toBe("Order didn't go through");
    expect(d.detail).toBe("Your money is back in your cash.");
  });

  it("reports a delayed buy calmly", async () => {
    const { cookie, userId, handle, stock } = await setupWorld("delayed@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "ord-dep-delay-1");
    const preview = await previewOrder(cookie, stock.id, { side: "buy", amount_kobo: "2000000" });
    const p = dataOf<AppOrderPreviewDto>(preview.json);
    const placed = await placeWith(cookie, p.preview_id, "ord-key-delay-1", "1357");
    expect(placed.status).toBe(201);
    const order = dataOf<AppOrderDto>(placed.json);
    const investment = await db.investment.findUniqueOrThrow({
      where: { key: `app-order:${userId}:ord-key-delay-1:investment` },
    });
    const scen = await callRoute(onchainScenariosPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/beta/onchain-scenarios`,
      cookie,
      headers: { "idempotency-key": "scen-delay-1" },
      body: { operation_id: investment.operationId, scenario: "sponsor_shortage" },
    });
    expect(scen.status).toBe(200);
    await drainJobs();
    await handle.mine(3);
    let res = await callAppRoute(orderGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/orders/${order.id}`,
      cookie,
      params: { id: order.id },
    });
    expect(dataOf<AppOrderDto>(res.json).status).toBe("processing");
    expect(dataOf<AppOrderDto>(res.json).title).toBe("Buying Test Stock A");

    // With a hold on the investment the copy says the money is safe.
    await db.investment.update({
      where: { id: investment.id },
      data: { holdReason: "SPONSOR_UNAVAILABLE" },
    });
    res = await callAppRoute(orderGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/orders/${order.id}`,
      cookie,
      params: { id: order.id },
    });
    const d = dataOf<AppOrderDto>(res.json);
    expect(d.status).toBe("processing");
    expect(d.detail).toBe("This is taking longer than usual. Your money is safe.");
  });

  it("turns a stale price into a waiting preview", async () => {
    const { cookie, stock } = await setupWorld("stale@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "ord-dep-stale-1");
    await db.stock.update({
      where: { id: stock.id },
      data: { referenceAsOf: new Date(now().getTime() - 3 * 86_400_000) },
    });
    const res = await callAppRoute(previewPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/orders/preview`,
      cookie,
      body: { stock_id: stock.id, side: "buy", amount_kobo: "2000000", pay_with: "cash" },
    });
    expect(res.status).toBe(200);
    const p = dataOf<AppOrderPreviewDto>(res.json);
    expect(p.executes).toBe("when_prices_update");
    expect(p.price_limit_kobo).not.toBeNull();
    expect(p.order_valid_until).not.toBeNull();
    expect(p.notes.length).toBeGreaterThan(0);
  });
});
