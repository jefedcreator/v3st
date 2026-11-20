import { describe, expect, it, vi } from "vitest";

import { POST as previewPOST } from "@/app/api/v1/app/orders/preview/route";
import { POST as ordersPOST } from "@/app/api/v1/app/orders/route";
import { DELETE as orderDELETE, GET as orderGET } from "@/app/api/v1/app/orders/[id]/route";
import { POST as betaCompletePOST } from "@/app/api/v1/app/beta/deposits/[id]/complete/route";
import { POST as betaOrderCompletePOST } from "@/app/api/v1/app/beta/orders/[id]/complete-transfer/route";
import { POST as depositsPOST } from "@/app/api/v1/app/cash/deposits/route";
import { GET as cashGET } from "@/app/api/v1/app/cash/route";
import { POST as withdrawalPreviewPOST } from "@/app/api/v1/app/withdrawals/preview/route";
import type { AppOrderDto, AppOrderPreviewDto } from "@/types/app";
import { authorizationService } from "@/backend/services/authorizations";
import { policy } from "@/backend/config/policy";
import { now } from "@/backend/clock";
import { customerOrderService } from "@/backend/services/customer-orders";
import { customerOrderExecutor, withinLimit } from "@/backend/services/customer-orders/executor";
import { investmentService } from "@/backend/services/investments";
import { effectiveSharePriceMicroUsd, worstFillSharePriceMicroUsd } from "@/backend/services/stocks/reference";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { publicClientFor } from "@/backend/services/onchain/testnet";
import { ratesService } from "@/backend/services/rates";
import { db, withTx } from "@/server/db";
import { fromDbRaw, toDbRaw } from "@/utils/asset-units";
import { usdToNgn } from "@/utils/money";

import { callAppRoute, ORIGIN, readyCustomer } from "../helpers/app";
import { useTestDatabase } from "../helpers/db";
import { seedTreasury } from "../helpers/factories";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";
import { setNow } from "../helpers/time";
import { drainJobs } from "../helpers/worker";

useTestDatabase();

function dataOf<T>(json: unknown): T {
  return (json as { data: T }).data;
}

type CashDto = {
  available_kobo: string | null;
  on_hold_kobo: string | null;
  incoming_kobo: string | null;
  as_of: string;
};

async function touchReference(stockId: string) {
  await db.stock.update({
    where: { id: stockId },
    data: { referenceAsOf: now(), referencePriceMicroUsd: 2_000_000n, referenceBasis: "share_price" },
  });
}

async function staleReference(stockId: string) {
  await db.stock.update({
    where: { id: stockId },
    data: { referenceAsOf: new Date(now().getTime() - 3 * 86_400_000) },
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

async function cashOf(cookie: string): Promise<CashDto> {
  const res = await callAppRoute(cashGET, { method: "GET", url: `${ORIGIN}/api/v1/app/cash`, cookie });
  return dataOf<CashDto>(res.json);
}

async function previewRaw(cookie: string, stockId: string, body: Record<string, unknown>) {
  return callAppRoute(previewPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/orders/preview`,
    cookie,
    body: { stock_id: stockId, ...body },
  });
}

function placeWith(cookie: string, previewId: string, key: string, pin = "1357") {
  return callAppRoute(ordersPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/orders`,
    cookie,
    headers: { "idempotency-key": key },
    body: { preview_id: previewId, pin },
  });
}

async function getOrder(cookie: string, orderId: string): Promise<AppOrderDto> {
  const res = await callAppRoute(orderGET, {
    method: "GET",
    url: `${ORIGIN}/api/v1/app/orders/${orderId}`,
    cookie,
    params: { id: orderId },
  });
  return dataOf<AppOrderDto>(res.json);
}

async function sweepAndDrive(handle: Awaited<ReturnType<typeof testnet>>, stockId: string, orderId: string, cookie: string) {
  for (let i = 0; i < 14; i += 1) {
    await touchReference(stockId);
    await customerOrderExecutor.sweep();
    await drainJobs();
    await handle.mine(3);
    const order = await getOrder(cookie, orderId);
    if (["completed", "failed", "cancelled", "expired"].includes(order.status)) return order;
  }
  return getOrder(cookie, orderId);
}

describe("customer waiting orders", () => {
  it("buys when prices update", async () => {
    const { cookie, userId, handle, stock } = await setupWorld("wait-buy@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "w-dep-buy-1");
    const cashBefore = await cashOf(cookie);

    await staleReference(stock.id);
    const preview = await previewRaw(cookie, stock.id, {
      side: "buy",
      amount_kobo: "2000000",
      pay_with: "cash",
    });
    expect(preview.status).toBe(200);
    const p = dataOf<AppOrderPreviewDto>(preview.json);
    expect(p.executes).toBe("when_prices_update");
    expect(p.price_limit_kobo).not.toBeNull();

    const placed = await placeWith(cookie, p.preview_id, "w-key-buy-1");
    expect(placed.status).toBe(201);
    const order = dataOf<AppOrderDto>(placed.json);
    expect(order.status).toBe("waiting_for_price");
    expect(order.title).toBe("Waiting for prices to update");
    expect(order.can_cancel).toBe(true);

    const cashHeld = await cashOf(cookie);
    expect(BigInt(cashHeld.on_hold_kobo!)).toBeGreaterThan(0n);
    expect(BigInt(cashHeld.available_kobo!)).toBeLessThan(BigInt(cashBefore.available_kobo!));

    const done = await sweepAndDrive(handle, stock.id, order.id, cookie);
    expect(done.status).toBe("completed");
    expect(done.title).toBe("Bought Test Stock A");

    const cashAfter = await cashOf(cookie);
    expect(BigInt(cashAfter.on_hold_kobo!)).toBeLessThan(BigInt(cashHeld.on_hold_kobo!));
    expect(await ledgerService.balance(acct.userStock(userId, stock.id))).toBeGreaterThan(0n);
  });

  it("never buys beyond the price limit, and expires with the cash released", async () => {
    const { cookie, userId, stock } = await setupWorld("wait-limit@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "w-dep-limit-1");
    const cashBefore = await cashOf(cookie);

    await staleReference(stock.id);
    const preview = await previewRaw(cookie, stock.id, {
      side: "buy",
      amount_kobo: "2000000",
      pay_with: "cash",
    });
    const p = dataOf<AppOrderPreviewDto>(preview.json);
    const placed = await placeWith(cookie, p.preview_id, "w-key-limit-1");
    expect(placed.status).toBe(201);
    const order = dataOf<AppOrderDto>(placed.json);
    expect(order.status).toBe("waiting_for_price");

    // A limit below any possible fill price: the order must wait, never execute.
    const orderRow = await db.customerOrder.findUniqueOrThrow({
      where: { key: `app-order:${userId}:w-key-limit-1` },
    });
    await db.customerOrder.update({ where: { id: orderRow.id }, data: { limitPriceMicroUsd: 1n } });
    await touchReference(stock.id);
    for (let i = 0; i < 3; i += 1) {
      await customerOrderExecutor.sweep();
      await drainJobs();
    }
    expect(await db.investment.count({ where: { key: `${orderRow.key}:investment` } })).toBe(0);
    expect((await getOrder(cookie, order.id)).status).toBe("waiting_for_price");

    // Past the 72-hour window the order expires and the cash is released.
    setNow(new Date(orderRow.expiresAt.getTime() + 1_000).toISOString());
    await customerOrderExecutor.sweep();
    await drainJobs();
    const after = await db.customerOrder.findUniqueOrThrow({ where: { id: orderRow.id } });
    expect(after.status).toBe("expired");
    const auth = await db.investmentAuthorization.findUniqueOrThrow({
      where: { id: after.authorizationId! },
    });
    expect(auth.revokedAt).not.toBeNull();
    const cashAfter = await cashOf(cookie);
    expect(BigInt(cashAfter.available_kobo!)).toBe(BigInt(cashBefore.available_kobo!));
    expect(BigInt(cashAfter.on_hold_kobo!)).toBe(0n);
    const view = await getOrder(cookie, order.id);
    expect(view.status).toBe("expired");
    expect(view.title).toBe("Order expired");
    expect(view.detail).toContain("Your money is in your cash.");
  });

  it("judges the price limit on the worst fill a quote allows, not the expected one", async () => {
    const { cookie, userId, stock } = await setupWorld("wait-worst@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "w-dep-worst-1");
    await staleReference(stock.id);
    const preview = await previewRaw(cookie, stock.id, { side: "buy", amount_kobo: "2000000", pay_with: "cash" });
    const placed = await placeWith(cookie, dataOf<AppOrderPreviewDto>(preview.json).preview_id, "w-key-worst-1");
    expect(dataOf<AppOrderDto>(placed.json).status).toBe("waiting_for_price");
    const orderRow = await db.customerOrder.findUniqueOrThrow({ where: { key: `app-order:${userId}:w-key-worst-1` } });
    await touchReference(stock.id);

    // Price the order's budget the way the executor will.
    const fresh = await db.stock.findUniqueOrThrow({ where: { id: stock.id } });
    const q = await investmentService.quote(userId, { stockId: stock.id, side: "buy", inputRaw: orderRow.budgetMicroUsd! });
    const expected = effectiveSharePriceMicroUsd(fresh, "buy", BigInt(q.input_raw), BigInt(q.expected_output_raw))!;
    const worst = worstFillSharePriceMicroUsd(fresh, "buy", BigInt(q.input_raw), BigInt(q.min_output_raw))!;
    expect(worst > expected).toBe(true);

    // A limit at the expected price is not enough: slippage could fill past it.
    // drainJobs moves the clock to each job's run time, so the price is refreshed
    // before every sweep; only the limit can keep this order waiting.
    await db.customerOrder.update({ where: { id: orderRow.id }, data: { limitPriceMicroUsd: expected } });
    for (let i = 0; i < 2; i += 1) {
      await touchReference(stock.id);
      await customerOrderExecutor.sweep();
      await drainJobs();
    }
    expect(await db.investment.count({ where: { key: `${orderRow.key}:investment` } })).toBe(0);
    expect((await db.customerOrder.findUniqueOrThrow({ where: { id: orderRow.id } })).status).toBe("waiting_for_price");

    // A limit that covers the worst allowed fill executes.
    await db.customerOrder.update({ where: { id: orderRow.id }, data: { limitPriceMicroUsd: worst } });
    await touchReference(stock.id);
    await customerOrderExecutor.sweep();
    await drainJobs();
    expect(await db.investment.count({ where: { key: `${orderRow.key}:investment` } })).toBe(1);
  });

  it("buys after a bank transfer, with the cash held as it lands", async () => {
    const { cookie, userId, handle, stock } = await setupWorld("wait-bank@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "w-dep-bank-1");
    const cashBefore = await cashOf(cookie);

    await touchReference(stock.id);
    const preview = await previewRaw(cookie, stock.id, {
      side: "buy",
      amount_kobo: "2000000",
      pay_with: "bank_transfer",
    });
    expect(preview.status).toBe(200);
    const p = dataOf<AppOrderPreviewDto>(preview.json);
    expect(p.executes).toBe("after_your_transfer");
    expect(p.pay_with).toBe("bank_transfer");
    expect(p.fees.map((f) => f.label)).toContain("Bank transfer fee");

    const placed = await placeWith(cookie, p.preview_id, "w-key-bank-1");
    expect(placed.status).toBe(201);
    const order = dataOf<AppOrderDto>(placed.json);
    expect(order.status).toBe("waiting_for_payment");
    expect(order.title).toBe("Waiting for your transfer");
    expect(order.pay_to).not.toBeNull();
    expect(order.pay_to!.amount_kobo).toBe("2000000");
    expect(order.timeline.map((t) => t.label)).toEqual([
      "Order placed",
      "Transfer received",
      "Buying shares",
      "Done",
    ]);

    const orderRow = await db.customerOrder.findUniqueOrThrow({
      where: { key: `app-order:${userId}:w-key-bank-1` },
    });
    expect(orderRow.depositOrderId).not.toBeNull();
    const deposit = await db.rampOrder.findUniqueOrThrow({ where: { id: orderRow.depositOrderId! } });
    const complete = await callAppRoute(betaCompletePOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/beta/deposits/${deposit.id}/complete`,
      cookie,
      params: { id: deposit.id },
    });
    expect(complete.status).toBe(200);
    for (let i = 0; i < 12; i += 1) {
      await drainJobs();
      await handle.mine(3);
    }
    // The landed transfer is held in the funding transaction: a cashReserved
    // journal moves exactly the deposit's USD amount from spendable cash to the
    // order's hold, so available cash is unchanged when the money lands.
    const holdJournal = await db.ledgerJournal.findUniqueOrThrow({
      where: { key: `${orderRow.holdKey}:reserve` },
    });
    const holdEntries = await db.ledgerEntry.findMany({ where: { journalId: holdJournal.id } });
    const accountIds = [
      ...holdEntries.map((e) => e.debitAccountId),
      ...holdEntries.map((e) => e.creditAccountId),
    ];
    const accounts = await db.ledgerAccount.findMany({ where: { id: { in: accountIds } } });
    const codeById = new Map(accounts.map((a) => [a.id, a.code]));
    const reservedCode = acct.userReserved(userId, "testnet").code;
    const cashCode = acct.userCash(userId, "testnet").code;
    const holdCredit = holdEntries.find((e) => codeById.get(e.creditAccountId) === reservedCode);
    const holdDebit = holdEntries.find((e) => codeById.get(e.debitAccountId) === cashCode);
    expect(fromDbRaw(holdCredit?.amount ?? toDbRaw(0n))).toBe(deposit.usdAmount!);
    expect(fromDbRaw(holdDebit?.amount ?? toDbRaw(0n))).toBe(deposit.usdAmount!);

    const done = await sweepAndDrive(handle, stock.id, order.id, cookie);
    expect(done.status).toBe("completed");
    // The transfer paid for the buy: spendable cash is back where it was and the
    // holding increased.
    const cashAfter = await cashOf(cookie);
    expect(BigInt(cashAfter.available_kobo!)).toBe(BigInt(cashBefore.available_kobo!));
    expect(await ledgerService.balance(acct.userStock(userId, stock.id))).toBeGreaterThan(0n);
  });

  it("releases cash that landed for an order cancelled before the executor ran", async () => {
    const { cookie, userId, handle, stock } = await setupWorld("wait-bank-cancel@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "w-dep-bank-cancel-1");
    const cashBefore = await cashOf(cookie);
    await touchReference(stock.id);
    const preview = await previewRaw(cookie, stock.id, {
      side: "buy",
      amount_kobo: "2000000",
      pay_with: "bank_transfer",
    });
    const p = dataOf<AppOrderPreviewDto>(preview.json);
    const order = dataOf<AppOrderDto>((await placeWith(cookie, p.preview_id, "w-key-bank-cancel-1")).json);
    expect(order.status).toBe("waiting_for_payment");
    const before = await db.customerOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(before.budgetMicroUsd).toBeNull();

    // The transfer lands while the executor is held back: the funding
    // transaction alone must leave the hold and its budget on the order.
    const progress = vi.spyOn(customerOrderExecutor, "progress").mockResolvedValue();
    try {
      const complete = await callAppRoute(betaCompletePOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/app/beta/deposits/${before.depositOrderId!}/complete`,
        cookie,
        params: { id: before.depositOrderId! },
      });
      expect(complete.status).toBe(200);
      for (let i = 0; i < 12; i += 1) {
        await drainJobs();
        await handle.mine(3);
      }
    } finally {
      progress.mockRestore();
    }
    const landed = await db.customerOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(landed.status).toBe("waiting_for_payment");
    const hold = await db.ledgerJournal.findUniqueOrThrow({ where: { key: `${landed.holdKey}:reserve` } });
    expect(hold).toBeTruthy();
    expect(landed.budgetMicroUsd).not.toBeNull();
    expect(BigInt((await cashOf(cookie)).on_hold_kobo!)).toBeGreaterThan(0n);

    const cancelled = await callAppRoute(orderDELETE, {
      method: "DELETE",
      url: `${ORIGIN}/api/v1/app/orders/${order.id}`,
      cookie,
      params: { id: order.id },
    });
    expect(dataOf<AppOrderDto>(cancelled.json).status).toBe("cancelled");
    const after = await cashOf(cookie);
    expect(BigInt(after.on_hold_kobo!)).toBe(0n);
    expect(BigInt(after.available_kobo!)).toBeGreaterThan(BigInt(cashBefore.available_kobo!));
    expect(await db.ledgerJournal.count({ where: { key: `${landed.holdKey}:release` } })).toBe(1);
    await customerOrderExecutor.sweep();
    await drainJobs();
    expect(await db.ledgerJournal.count({ where: { key: `${landed.holdKey}:release` } })).toBe(1);
    expect(await ledgerService.balance(acct.userReserved(userId, "testnet"))).toBe(0n);
  });

  it("refuses a bank-transfer buy the transfer could never cover", async () => {
    const { cookie, stock } = await setupWorld("wait-bank-limit@v3st.test");
    await touchReference(stock.id);
    const tooBig = await previewRaw(cookie, stock.id, {
      side: "buy",
      amount_kobo: (policy.deposits.maxKobo + 100n).toString(),
      pay_with: "bank_transfer",
    });
    expect(tooBig.status).toBe(422);
    expect((tooBig.json as { code: string }).code).toBe("LIMIT_REACHED");
    expect(await db.customerOrderPreview.count({ where: { stockId: stock.id } })).toBe(0);
  });

  it("cancels a waiting order and releases its cash exactly once", async () => {
    const { cookie, userId, stock } = await setupWorld("wait-cancel@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "w-dep-cancel-1");
    const cashBefore = await cashOf(cookie);

    await staleReference(stock.id);
    const preview = await previewRaw(cookie, stock.id, {
      side: "buy",
      amount_kobo: "2000000",
      pay_with: "cash",
    });
    const p = dataOf<AppOrderPreviewDto>(preview.json);
    const placed = await placeWith(cookie, p.preview_id, "w-key-cancel-1");
    const order = dataOf<AppOrderDto>(placed.json);
    expect(order.status).toBe("waiting_for_price");
    const orderRow = await db.customerOrder.findUniqueOrThrow({
      where: { key: `app-order:${userId}:w-key-cancel-1` },
    });
    expect(orderRow.holdKey).not.toBeNull();

    const cancelled = await callAppRoute(orderDELETE, {
      method: "DELETE",
      url: `${ORIGIN}/api/v1/app/orders/${order.id}`,
      cookie,
      params: { id: order.id },
    });
    expect(cancelled.status).toBe(200);
    const view = dataOf<AppOrderDto>(cancelled.json);
    expect(view.status).toBe("cancelled");
    expect(view.title).toBe("Order cancelled");
    expect(view.detail).toBe("Your money is in your cash.");
    expect(view.can_cancel).toBe(false);

    const cashAfter = await cashOf(cookie);
    expect(BigInt(cashAfter.available_kobo!)).toBe(BigInt(cashBefore.available_kobo!));
    expect(BigInt(cashAfter.on_hold_kobo!)).toBe(0n);

    await customerOrderExecutor.sweep();
    await drainJobs();
    await customerOrderExecutor.sweep();
    await drainJobs();
    expect(
      await db.ledgerJournal.count({ where: { key: `${orderRow.holdKey}:release` } }),
    ).toBe(1);
  });

  it("puts an interrupted waiting order back to wait with its hold intact", async () => {
    const { cookie, stock } = await setupWorld("wait-resume@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "w-dep-resume-1");
    await staleReference(stock.id);
    const p = dataOf<AppOrderPreviewDto>(
      (await previewRaw(cookie, stock.id, { side: "buy", amount_kobo: "2000000", pay_with: "cash" })).json,
    );
    const order = dataOf<AppOrderDto>((await placeWith(cookie, p.preview_id, "w-key-resume-1")).json);
    expect(order.status).toBe("waiting_for_price");
    const heldBefore = BigInt((await cashOf(cookie)).on_hold_kobo!);
    expect(heldBefore).toBeGreaterThan(0n);

    // The process stopped right after moving the order to executing, before any
    // investment was created. A fresh attempt might still be running: leave it.
    await db.customerOrder.update({ where: { id: order.id }, data: { status: "executing", updatedAt: now() } });
    await customerOrderService.resumeNow(order.id);
    expect((await db.customerOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("executing");

    // Long after: nothing was bought, so the order waits again with its hold.
    await db.customerOrder.update({
      where: { id: order.id },
      data: { updatedAt: new Date(now().getTime() - 600_000) },
    });
    await customerOrderService.resumeNow(order.id);
    const resumed = await db.customerOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(resumed.status).toBe("waiting_for_price");
    expect(resumed.investmentId).toBeNull();
    expect(BigInt((await cashOf(cookie)).on_hold_kobo!)).toBe(heldBefore);
  });

  it("refuses to cancel an order that has started", async () => {
    const { cookie, handle, stock } = await setupWorld("wait-started@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "w-dep-started-1");
    await touchReference(stock.id);
    const preview = await previewRaw(cookie, stock.id, { side: "buy", amount_kobo: "2000000" });
    const p = dataOf<AppOrderPreviewDto>(preview.json);
    expect(p.executes).toBe("now");
    const placed = await placeWith(cookie, p.preview_id, "w-key-started-1");
    const order = dataOf<AppOrderDto>(placed.json);
    expect(order.status).toBe("processing");
    const res = await callAppRoute(orderDELETE, {
      method: "DELETE",
      url: `${ORIGIN}/api/v1/app/orders/${order.id}`,
      cookie,
      params: { id: order.id },
    });
    expect(res.status).toBe(409);
    expect((res.json as { code: string }).code).toBe("ALREADY_STARTED");
    await handle.mine(1);
  });

  it("never spends held cash twice", async () => {
    const { cookie, userId, stock } = await setupWorld("wait-double@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "w-dep-double-1");
    const cash = await cashOf(cookie);
    const cashMicro = await ledgerService.balance(acct.userCash(userId, "testnet"));
    const depositRate = (await ratesService.display()).depositRate;
    const fullAmountKobo = usdToNgn(cashMicro, depositRate, "ceil");

    await staleReference(stock.id);
    const preview = await previewRaw(cookie, stock.id, {
      side: "buy",
      amount_kobo: fullAmountKobo.toString(),
      pay_with: "cash",
    });
    expect(preview.status).toBe(200);
    const p = dataOf<AppOrderPreviewDto>(preview.json);
    const placed = await placeWith(cookie, p.preview_id, "w-key-double-1");
    expect(placed.status).toBe(201);
    expect(dataOf<AppOrderDto>(placed.json).status).toBe("waiting_for_price");
    expect(BigInt((await cashOf(cookie)).on_hold_kobo!)).toBeGreaterThan(0n);

    // The held cash is gone from spendable balance: a second cash buy and a
    // withdrawal preview both refuse with NOT_ENOUGH_CASH.
    const second = await previewRaw(cookie, stock.id, {
      side: "buy",
      amount_kobo: "100000",
      pay_with: "cash",
    });
    expect(second.status).toBe(409);
    expect((second.json as { code: string }).code).toBe("NOT_ENOUGH_CASH");
    const withdrawal = await callAppRoute(withdrawalPreviewPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/withdrawals/preview`,
      cookie,
      body: { amount_kobo: "100000" },
    });
    expect(withdrawal.status).toBe(409);
    expect((withdrawal.json as { code: string }).code).toBe("NOT_ENOUGH_CASH");
    void cash;
  });

  it("holds shares for a waiting sell", async () => {
    const { cookie, userId, handle, stock } = await setupWorld("wait-sell@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "w-dep-sell-1");
    await touchReference(stock.id);
    const buyPreview = await previewRaw(cookie, stock.id, { side: "buy", amount_kobo: "2000000" });
    const bp = dataOf<AppOrderPreviewDto>(buyPreview.json);
    const buy = await placeWith(cookie, bp.preview_id, "w-key-sell-buy");
    expect(buy.status).toBe(201);
    for (let i = 0; i < 14; i += 1) {
      await touchReference(stock.id);
      await drainJobs();
      await handle.mine(3);
      const o = await getOrder(cookie, dataOf<AppOrderDto>(buy.json).id);
      if (["completed", "failed"].includes(o.status)) break;
    }
    const holding = await ledgerService.balance(acct.userStock(userId, stock.id));
    expect(holding).toBeGreaterThan(0n);

    await staleReference(stock.id);
    const sellPreview = await previewRaw(cookie, stock.id, { side: "sell", sell_all: true });
    expect(sellPreview.status).toBe(200);
    const sp = dataOf<AppOrderPreviewDto>(sellPreview.json);
    expect(sp.executes).toBe("when_prices_update");
    const placed = await placeWith(cookie, sp.preview_id, "w-key-sell-1");
    expect(placed.status).toBe(201);
    const sellOrder = dataOf<AppOrderDto>(placed.json);
    expect(sellOrder.status).toBe("waiting_for_price");
    expect(await ledgerService.balance(acct.userStockReserved(userId, stock.id))).toBe(holding);

    // With all shares held, another sell-all preview has nothing left to sell.
    const again = await previewRaw(cookie, stock.id, { side: "sell", sell_all: true });
    expect(again.status).toBe(409);
    expect((again.json as { code: string }).code).toBe("NOT_ENOUGH_SHARES");
  });

  it("rejects an order consent used above its limit", async () => {
    const { cookie, userId, stock } = await setupWorld("wait-consent@v3st.test");
    await addMoneyAndComplete(cookie, "10000000", "w-dep-consent-1");
    await staleReference(stock.id);
    const preview = await previewRaw(cookie, stock.id, {
      side: "buy",
      amount_kobo: "2000000",
      pay_with: "cash",
    });
    const p = dataOf<AppOrderPreviewDto>(preview.json);
    const placed = await placeWith(cookie, p.preview_id, "w-key-consent-1");
    const orderRow = await db.customerOrder.findUniqueOrThrow({
      where: { key: `app-order:${userId}:w-key-consent-1` },
    });
    expect(placed.status).toBe(201);
    const consentId = orderRow.authorizationId!;
    const limit = orderRow.limitPriceMicroUsd;
    expect(withinLimit("buy", limit, limit)).toBe(true);
    expect(withinLimit("buy", limit + 1n, limit)).toBe(false);
    expect(withinLimit("sell", limit, limit)).toBe(true);
    expect(withinLimit("sell", limit - 1n, limit)).toBe(false);

    await withTx(async (tx) => {
      await expect(
        authorizationService.check(tx, userId, consentId, {
          action: "order_buy",
          quote: {
            kind: "investment",
            id: "missing-quote",
            stockId: stock.id,
            valueMicroUsd: 1n,
            effectivePriceMicroUsd: limit + 1n,
          },
        }),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_EXCEEDED" });
      await expect(
        authorizationService.check(tx, userId, consentId, {
          action: "order_buy",
          quote: { kind: "investment", id: "missing-quote", stockId: stock.id, valueMicroUsd: 1n },
        }),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_EXCEEDED" });
    });

    it("completes a pay-by-transfer order's test transfer from the order", async () => {
      const { cookie, handle, stock } = await setupWorld("wait-bank-order@v3st.test");
      await touchReference(stock.id);
      const preview = await previewRaw(cookie, stock.id, {
        side: "buy",
        amount_kobo: "2000000",
        pay_with: "bank_transfer",
      });
      const p = dataOf<AppOrderPreviewDto>(preview.json);
      const placed = await placeWith(cookie, p.preview_id, "w-key-bank-order");
      expect(placed.status).toBe(201);
      const order = dataOf<AppOrderDto>(placed.json);

      const res = await callAppRoute(betaOrderCompletePOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/app/beta/orders/${order.id}/complete-transfer`,
        cookie,
        params: { id: order.id },
      });
      expect(res.status).toBe(200);
      expect(dataOf<AppOrderDto>(res.json).id).toBe(order.id);

      for (let i = 0; i < 12; i += 1) {
        await drainJobs();
        await handle.mine(3);
      }
      const done = await getOrder(cookie, order.id);
      expect(done.status).toBe("completed");

      const again = await callAppRoute(betaOrderCompletePOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/app/beta/orders/${order.id}/complete-transfer`,
        cookie,
        params: { id: order.id },
      });
      expect(again.status).toBe(200);
    });

    it("refuses another customer's order", async () => {
      const mine = await setupWorld("wait-bank-mine@v3st.test");
      await touchReference(mine.stock.id);
      const preview = await previewRaw(mine.cookie, mine.stock.id, {
        side: "buy",
        amount_kobo: "2000000",
        pay_with: "bank_transfer",
      });
      const p = dataOf<AppOrderPreviewDto>(preview.json);
      const placed = await placeWith(mine.cookie, p.preview_id, "w-key-bank-other");
      const order = dataOf<AppOrderDto>(placed.json);

      const other = await readyCustomer("wait-bank-other@v3st.test");
      const res = await callAppRoute(betaOrderCompletePOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/app/beta/orders/${order.id}/complete-transfer`,
        cookie: other.cookie,
        params: { id: order.id },
      });
      expect(res.status).toBe(404);
      expect((res.json as { code: string }).code).toBe("NOT_FOUND");
    });

    it("refuses an order paid with cash, which has no transfer", async () => {
      const { cookie, stock } = await setupWorld("wait-cash-order@v3st.test");
      await addMoneyAndComplete(cookie, "5000000", "w-key-cash-fund");
      await touchReference(stock.id);
      const preview = await previewRaw(cookie, stock.id, {
        side: "buy",
        amount_kobo: "2000000",
        pay_with: "cash",
      });
      expect(preview.status).toBe(200);
      const p = dataOf<AppOrderPreviewDto>(preview.json);
      const placed = await placeWith(cookie, p.preview_id, "w-key-cash-order");
      expect(placed.status).toBe(201);
      const order = dataOf<AppOrderDto>(placed.json);

      const res = await callAppRoute(betaOrderCompletePOST, {
        method: "POST",
        url: `${ORIGIN}/api/v1/app/beta/orders/${order.id}/complete-transfer`,
        cookie,
        params: { id: order.id },
      });
      expect(res.status).toBe(404);
      expect((res.json as { code: string }).code).toBe("NOT_FOUND");
    });
  });
});
