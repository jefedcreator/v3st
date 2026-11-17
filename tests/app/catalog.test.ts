import { describe, expect, it } from "vitest";

import { GET as stocksGET } from "@/app/api/v1/app/stocks/route";
import { GET as stockGET } from "@/app/api/v1/app/stocks/[id]/route";
import { GET as chartGET } from "@/app/api/v1/app/stocks/[id]/chart/route";
import { PUT as watchPUT, DELETE as watchDELETE } from "@/app/api/v1/app/watchlist/[id]/route";
import { stockHistory } from "@/backend/services/stocks/history";
import { ratesService } from "@/backend/services/rates";
import { db } from "@/server/db";
import type { Stock } from "@/server/prisma";

import { callAppRoute, ORIGIN, signInCustomer } from "../helpers/app";
import { useTestDatabase } from "../helpers/db";
import { setNow } from "../helpers/time";

useTestDatabase();

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

type ListItem = {
  id: string;
  ticker: string;
  name: string;
  price_kobo: string | null;
  price_usd_micro: string | null;
  price_status: string;
  price_as_of: string | null;
  trading: string;
  on_watchlist: boolean;
};

async function listStocks(cookie: string, query = ""): Promise<ListItem[]> {
  const res = await callAppRoute(stocksGET, {
    method: "GET",
    url: `${ORIGIN}/api/v1/app/stocks${query}`,
    cookie,
  });
  expect(res.status).toBe(200);
  return (res.json as { data: ListItem[] }).data;
}

describe("customer catalog", () => {
  it("lists only profiled stocks on the customer network", async () => {
    const { cookie } = await signInCustomer("catalog@v3st.test");
    await makeCatalogStock({ displayTicker: "TSTA", referencePriceMicroUsd: 2_000_000n, referenceBasis: "token_nav", referenceAsOf: new Date() });
    await makeCatalogStock({ displayTicker: "ZZZZ", symbol: "ZZZZ" });
    await makeCatalogStock({ displayTicker: "TSTB", chain: "basesepolia" });
    const items = await listStocks(cookie);
    expect(items.map((i) => i.ticker)).toEqual(["TSTA"]);
    expect(items[0]!.name).toBe("Test Stock A");
    expect(items[0]!.trading).toBe("available");
    expect(items[0]!.price_status).toBe("live");
    const payout = (await ratesService.display()).payoutRate;
    expect(items[0]!.price_usd_micro).toBe("2000000");
    expect(items[0]!.price_kobo).toBe(((2_000_000n * payout.kobo) / payout.microUsd).toString());
  });

  it("marks delayed and missing prices honestly", async () => {
    const { cookie } = await signInCustomer("prices@v3st.test");
    const delayed = await makeCatalogStock({
      displayTicker: "TSTA",
      referencePriceMicroUsd: 2_000_000n,
      referenceBasis: "token_nav",
      referenceAsOf: new Date(Date.now() - 3 * 86_400_000),
    });
    const unpriced = await makeCatalogStock({ displayTicker: "TSTB" });
    // Older than the 7-day display window: unknown, so no number at all.
    await makeCatalogStock({
      displayTicker: "AAPL",
      referencePriceMicroUsd: 2_000_000n,
      referenceBasis: "token_nav",
      referenceAsOf: new Date(Date.now() - 8 * 86_400_000),
    });
    const items = await listStocks(cookie);
    const byTicker = new Map(items.map((i) => [i.ticker, i]));
    const tooOld = byTicker.get("AAPL")!;
    expect(tooOld.price_status).toBe("unavailable");
    expect(tooOld.price_kobo).toBeNull();
    expect(tooOld.price_usd_micro).toBeNull();
    const delayedItem = byTicker.get("TSTA")!;
    expect(delayedItem.price_status).toBe("delayed");
    expect(delayedItem.price_as_of).toBe(delayed.referenceAsOf!.toISOString());
    expect(delayedItem.trading).toBe("prices_updating");
    expect(delayedItem.price_kobo).not.toBeNull();
    const unpricedItem = byTicker.get("TSTB")!;
    expect(unpricedItem.price_kobo).toBeNull();
    expect(unpricedItem.price_usd_micro).toBeNull();
    expect(unpricedItem.price_status).toBe("unavailable");
    expect(unpricedItem.trading).toBe("prices_updating");
    expect(unpriced.id).toBeTruthy();
  });

  it("searches, toggles the watchlist idempotently and filters by it", async () => {
    const { cookie } = await signInCustomer("search@v3st.test");
    const a = await makeCatalogStock({ displayTicker: "TSTA", referencePriceMicroUsd: 2_000_000n, referenceBasis: "token_nav", referenceAsOf: new Date() });
    await makeCatalogStock({ displayTicker: "TSTB", referencePriceMicroUsd: 3_000_000n, referenceBasis: "token_nav", referenceAsOf: new Date() });

    for (const q of ["test", "TST"]) {
      const items = await listStocks(cookie, `?q=${q}`);
      expect(items.map((i) => i.ticker).sort()).toEqual(["TSTA", "TSTB"]);
    }
    const notFound = await listStocks(cookie, "?q=nomatch");
    expect(notFound).toEqual([]);

    const put1 = await callAppRoute(watchPUT, {
      method: "PUT",
      url: `${ORIGIN}/api/v1/app/watchlist/${a.id}`,
      cookie,
      params: { id: a.id },
    });
    expect(put1.status).toBe(200);
    await callAppRoute(watchPUT, {
      method: "PUT",
      url: `${ORIGIN}/api/v1/app/watchlist/${a.id}`,
      cookie,
      params: { id: a.id },
    });
    expect(await db.watchlistEntry.count({ where: { stockId: a.id } })).toBe(1);

    const watched = await listStocks(cookie, "?watchlist=true");
    expect(watched.map((i) => i.ticker)).toEqual(["TSTA"]);
    expect(watched[0]!.on_watchlist).toBe(true);

    const del = await callAppRoute(watchDELETE, {
      method: "DELETE",
      url: `${ORIGIN}/api/v1/app/watchlist/${a.id}`,
      cookie,
      params: { id: a.id },
    });
    expect(del.status).toBe(200);
    expect(await db.watchlistEntry.count({ where: { stockId: a.id } })).toBe(0);
  });

  it("returns chart points from snapshots and not_enough_data without them", async () => {
    const { cookie } = await signInCustomer("chart@v3st.test");
    const stock = await makeCatalogStock({ displayTicker: "TSTA" });
    // Aligned to a 15-minute bucket so all three snapshots land in one bucket.
    const base = new Date("2026-11-17T08:00:00.000Z").getTime();
    for (let i = 0; i < 3; i++) {
      await stockHistory.record(db, stock.id, {
        priceMicroUsd: BigInt(100_000_000 + i * 1_000_000),
        basis: "token_nav",
        asOf: new Date(base + i * 900_000),
        multiplierWad: 10n ** 18n,
      }, { kobo: 1_550_000n, microUsd: 1_000_000n });
    }
    const res = await callAppRoute(chartGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/stocks/${stock.id}/chart?range=1D`,
      cookie,
      params: { id: stock.id },
    });
    expect(res.status).toBe(200);
    const chart = (res.json as { data: { status: string; points: { t: string; price_kobo: string }[]; change_bps: number | null } }).data;
    expect(chart.status).toBe("ok");
    expect(chart.points).toHaveLength(3);
    expect(chart.points[0]!.t < chart.points[1]!.t).toBe(true);
    expect(chart.change_bps).toBeGreaterThan(0);

    const empty = await makeCatalogStock({ displayTicker: "TSTB" });
    const emptyRes = await callAppRoute(chartGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/stocks/${empty.id}/chart?range=1D`,
      cookie,
      params: { id: empty.id },
    });
    expect((emptyRes.json as { data: { status: string } }).data.status).toBe("not_enough_data");
  });

  it("shows a held delisted stock and hides an unheld one", async () => {
    const { cookie, userId } = await signInCustomer("held@v3st.test");
    const delisted = await makeCatalogStock({
      displayTicker: "TSTA",
      delisted: true,
      paused: false,
    });
    const other = await makeCatalogStock({ displayTicker: "TSTB" });

    // Not held: both are outside the catalog → NOT_FOUND.
    const hidden = await callAppRoute(stockGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/stocks/${delisted.id}`,
      cookie,
      params: { id: delisted.id },
    });
    expect(hidden.status).toBe(404);
    expect((hidden.json as { code: string }).code).toBe("NOT_FOUND");

    // Give the customer a holding in the delisted stock.
    const { ledgerService } = await import("@/backend/services/ledger");
    const { acct } = await import("@/backend/services/ledger/accounts");
    const { openingBalance } = await import("@/backend/services/ledger/postings");
    const { withTx } = await import("@/server/db");
    await withTx((tx) =>
      ledgerService.post(tx, openingBalance({ account: acct.userStock(userId, delisted.id), amount: 5n * 10n ** 18n })),
    );
    void other;
    const shown = await callAppRoute(stockGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/stocks/${delisted.id}`,
      cookie,
      params: { id: delisted.id },
    });
    expect(shown.status).toBe(200);
    const detail = (shown.json as { data: { ticker: string; trading: string; your_position: { shares_micro: string } | null; documents: string[] } }).data;
    expect(detail.ticker).toBe("TSTA");
    expect(detail.trading).toBe("paused");
    expect(detail.your_position?.shares_micro).toBe("5000000");
    expect(detail.documents).toEqual(["how-shares-are-held"]);
    void setNow;
  });
});
