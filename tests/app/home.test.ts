import { describe, expect, it } from "vitest";

import { GET as homeGET } from "@/app/api/v1/app/home/route";
import { GET as holdingsGET } from "@/app/api/v1/app/holdings/route";
import { POST as previewPOST } from "@/app/api/v1/app/orders/preview/route";
import { POST as ordersPOST } from "@/app/api/v1/app/orders/route";
import { DELETE as orderDELETE } from "@/app/api/v1/app/orders/[id]/route";
import type { AppHomeDto } from "@/backend/services/app/home";
import type { AppHoldingDto } from "@/backend/services/app/holdings";
import type { AppOrderPreviewDto } from "@/backend/services/app/orders";
import { now } from "@/backend/clock";
import { lagosWeek } from "@/backend/services/jobs/schedule";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { db, withTx } from "@/server/db";
import type { Stock } from "@/server/prisma";
import { toDbRaw } from "@/utils/asset-units";

import { callAppRoute, ORIGIN, readyCustomer, signInCustomer } from "../helpers/app";
import { useTestDatabase } from "../helpers/db";
import { fundCash } from "../helpers/factories";
import { setNow } from "../helpers/time";

useTestDatabase();

function dataOf<T>(json: unknown): T {
  return (json as { data: T }).data;
}

async function makeCatalogStock(overrides: Partial<Stock> & { displayTicker: string }): Promise<Stock> {
  return db.stock.create({
    data: {
      symbol: overrides.displayTicker,
      name: `${overrides.displayTicker} fixture`,
      chain: "testnet",
      tokenAddress: `0x${"ab".repeat(20)}`,
      decimals: 18,
      enabled: true,
      simPriceMicroUsdc: 2_000_000n,
      simWeeklyEarningMicroPerShare: 0n,
      ...overrides,
    } as never,
  });
}

// Credits a stock holding straight into the user's stock account.
async function fundStock(userId: string, stockId: string, raw: bigint) {
  await withTx((tx) =>
    ledgerService.post(tx, {
      key: `fixture-stock:${userId}:${stockId}`,
      kind: "openingBalance",
      orderId: null,
      entries: [
        {
          debit: acct.equityOpening(`STOCK:${stockId}`),
          credit: acct.userStock(userId, stockId),
          amount: raw,
        },
      ],
    }),
  );
}

async function openLot(userId: string, stockId: string, quantity: bigint, costUsdc: bigint, fxRateKobo: bigint | null) {
  await db.positionLot.create({
    data: {
      userId,
      stockId,
      asset: `STOCK:${stockId}`,
      quantity: toDbRaw(quantity),
      costUsdc: toDbRaw(costUsdc),
      fxRateKobo,
      source: "fixture",
    },
  });
}

async function getHome(cookie: string): Promise<AppHomeDto> {
  const res = await callAppRoute(homeGET, {
    method: "GET",
    url: `${ORIGIN}/api/v1/app/home`,
    cookie,
  });
  expect(res.status).toBe(200);
  return dataOf<AppHomeDto>(res.json);
}

describe("customer home and holdings", () => {
  it("values a holding at its last known price, marked delayed", async () => {
    setNow("2026-11-17T09:00:00Z");
    const { cookie } = await signInCustomer("home1@v3st.test");
    await fundCash((await db.user.findUniqueOrThrow({ where: { email: "home1@v3st.test" } })).id, 10_000_000n, "testnet");
    const stock = await makeCatalogStock({
      displayTicker: "TSTA",
      referencePriceMicroUsd: 2_000_000n,
      referenceBasis: "token_nav",
      referenceAsOf: new Date(now().getTime() - 3 * 86_400_000),
    });
    await fundStock((await db.user.findUniqueOrThrow({ where: { email: "home1@v3st.test" } })).id, stock.id, 500_000n * 10n ** 18n);

    const res = await callAppRoute(holdingsGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/holdings`,
      cookie,
    });
    const holdings = dataOf<AppHoldingDto[]>(res.json);
    expect(holdings).toHaveLength(1);
    expect(holdings[0]!.value_kobo).not.toBeNull();
    expect(holdings[0]!.price_status).toBe("delayed");
    expect(holdings[0]!.price_as_of).toBeTruthy();
    expect(BigInt(holdings[0]!.shares_micro)).toBe(500_000n * 10n ** 6n);

    const home = await getHome(cookie);
    expect(home.total_status).toBe("ok");
    expect(home.holdings).toHaveLength(1);
    expect(BigInt(home.total_kobo!)).toBe(
      BigInt(home.cash.available_kobo!) +
        BigInt(home.cash.on_hold_kobo!) +
        BigInt(home.holdings[0]!.value_kobo!),
    );
    expect(home.beta.test_money).toBe(true);
    expect(home.earnings.next_payout_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("never shows an unknown value as zero", async () => {
    setNow("2026-11-17T09:00:00Z");
    const { cookie, userId } = await readyCustomer("home2@v3st.test");
    await fundCash(userId, 10_000_000n, "testnet");
    const priced = await makeCatalogStock({
      displayTicker: "TSTA",
      referencePriceMicroUsd: 2_000_000n,
      referenceBasis: "token_nav",
      referenceAsOf: now(),
    });
    const unpriced = await makeCatalogStock({ displayTicker: "TSTB", symbol: "TSTB" });
    await fundStock(userId, priced.id, 100_000n * 10n ** 18n);
    await fundStock(userId, unpriced.id, 50_000n * 10n ** 18n);

    const home = await getHome(cookie);
    const unpricedHolding = home.holdings.find((h) => h.id === unpriced.id)!;
    expect(unpricedHolding.value_kobo).toBeNull();
    expect(unpricedHolding.price_status).toBe("unavailable");
    expect(home.total_status).toBe("partial");
    const pricedHolding = home.holdings.find((h) => h.id === priced.id)!;
    expect(BigInt(home.total_kobo!)).toBe(
      BigInt(home.cash.available_kobo!) +
        BigInt(home.cash.on_hold_kobo!) +
        BigInt(pricedHolding.value_kobo!),
    );
  });

  it("computes naira cost and return from each lot's purchase rate", async () => {
    setNow("2026-11-17T09:00:00Z");
    const { cookie, userId } = await readyCustomer("home3@v3st.test");
    const stock = await makeCatalogStock({
      displayTicker: "TSTA",
      referencePriceMicroUsd: 2_000_000n,
      referenceBasis: "token_nav",
      referenceAsOf: now(),
    });
    await fundStock(userId, stock.id, 625_000n * 10n ** 18n);
    await openLot(userId, stock.id, 625_000n * 10n ** 18n, 12_500_000n, 160_000n);

    const home = await getHome(cookie);
    const holding = home.holdings.find((h) => h.id === stock.id)!;
    expect(holding.cost_kobo).toBe("2000000");
    // value = 625,000 shares x $2 = $1,250,000 micro -> kobo at the payout rate
    // (1550 NGN/USD): 1,250,000 * 155,000 / 1,000,000 = 193,750 kobo... floor via rate
    expect(holding.value_kobo).not.toBeNull();
    expect(BigInt(holding.return_kobo!)).toBe(BigInt(holding.value_kobo!) - 2_000_000n);
    expect(holding.return_bps).not.toBeNull();
  });

  it("shows and clears action items", async () => {
    setNow("2026-11-17T09:00:00Z");
    const { cookie, userId } = await readyCustomer("home4@v3st.test");
    await fundCash(userId, 10_000_000n, "testnet");
    const stock = await makeCatalogStock({
      displayTicker: "TSTA",
      referencePriceMicroUsd: 2_000_000n,
      referenceBasis: "token_nav",
      referenceAsOf: now(),
    });
    // This week's earnings with no choice made yet.
    await db.earning.create({
      data: {
        userId,
        week: lagosWeek(now()),
        chain: "testnet",
        amountUsdc: 2_000_000n,
        harvestedAt: now(),
      },
    });

    let home = await getHome(cookie);
    expect(home.action_items.map((a) => a.kind)).toContain("choose_earnings");

    // A waiting bank-transfer order adds a finish_transfer item.
    await db.stock.update({
      where: { id: stock.id },
      data: { referenceAsOf: new Date(now().getTime() - 3 * 86_400_000) },
    });
    const preview = await callAppRoute(previewPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/orders/preview`,
      cookie,
      body: { stock_id: stock.id, side: "buy", amount_kobo: "2000000", pay_with: "bank_transfer" },
    });
    expect(preview.status).toBe(200);
    const p = dataOf<AppOrderPreviewDto>(preview.json);
    expect(p.executes).toBe("after_your_transfer");
    const placed = await callAppRoute(ordersPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/orders`,
      cookie,
      headers: { "idempotency-key": "home-key-1" },
      body: { preview_id: p.preview_id, pin: "1357" },
    });
    expect(placed.status).toBe(201);
    const orderId = dataOf<{ id: string }>(placed.json).id;

    home = await getHome(cookie);
    const transferItem = home.action_items.find((a) => a.kind === "finish_transfer");
    expect(transferItem).toBeDefined();
    expect(transferItem!.link).toBe(`/orders/${orderId}`);
    expect(transferItem!.detail).toContain("Test Stock A");
    expect(home.open_orders.map((o) => o.id)).toContain(orderId);

    const cancelled = await callAppRoute(orderDELETE, {
      method: "DELETE",
      url: `${ORIGIN}/api/v1/app/orders/${orderId}`,
      cookie,
      params: { id: orderId },
    });
    expect(cancelled.status).toBe(200);
    home = await getHome(cookie);
    expect(home.action_items.map((a) => a.kind)).not.toContain("finish_transfer");
    expect(home.open_orders).toHaveLength(0);
  });
});
