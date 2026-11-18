import { describe, expect, it } from "vitest";

import { appCatalogService } from "@/backend/services/app/catalog";
import { stockHistory } from "@/backend/services/stocks/history";
import { findCustomerLeaks } from "@/backend/services/app/vocabulary";
import { db } from "@/server/db";
import type { Stock } from "@/server/prisma";
import type { PublicTickerDto, PublicTickerRow } from "@/types/landing";

import { signInCustomer } from "../helpers/app";
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

function rowOf(dto: PublicTickerDto, ticker: string): PublicTickerRow {
  const row = dto.rows.find((r) => r.ticker === ticker);
  if (!row) throw new Error(`no row for ${ticker}`);
  return row;
}

function newestPriceAsOf(rows: PublicTickerRow[]): string {
  const values = rows.map((r) => r.price_as_of).filter((v): v is string => v !== null).sort();
  return values.at(-1)!;
}

describe("public beta ticker", () => {
  it("returns the eight profiled tickers in order, never test stocks", async () => {
    setNow("2026-11-18T12:00:00Z");
    await makeCatalogStock({ displayTicker: "AAPL", referencePriceMicroUsd: 2_000_000n, referenceBasis: "token_nav", referenceAsOf: new Date() });
    await makeCatalogStock({ displayTicker: "TSTA" });
    const dto = await appCatalogService.publicTicker();
    expect(dto.rows.map((r) => r.ticker)).toEqual(["AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "GOOGL", "META", "SPCX"]);
    expect(rowOf(dto, "NVDA").price_kobo).toBeNull();
    expect(dto.rows[0]!.logo_path).toBe("/stocks/aapl.svg");
  });

  it("prices a row exactly as the customer catalog does", async () => {
    setNow("2026-11-18T12:00:00Z");
    const { userId } = await signInCustomer("ticker@v3st.test");
    await makeCatalogStock({ displayTicker: "AAPL", referencePriceMicroUsd: 2_000_000n, referenceBasis: "token_nav", referenceAsOf: new Date() });
    const listed = (await appCatalogService.list(userId, {})).find((s) => s.ticker === "AAPL")!;
    const row = rowOf(await appCatalogService.publicTicker(), "AAPL");
    expect(row.price_kobo).toBe(listed.price_kobo);
    expect(row.price_status).toBe(listed.price_status);
    expect(row.change_24h_bps).toBe(listed.change_24h_bps);
    expect(row.price_as_of).toBe(listed.price_as_of);
  });

  it("returns a null price once the reference is older than the display window", async () => {
    const referenceAsOf = new Date("2026-11-18T12:00:00Z");
    await makeCatalogStock({ displayTicker: "AAPL", referencePriceMicroUsd: 2_000_000n, referenceBasis: "token_nav", referenceAsOf });
    setNow(new Date(referenceAsOf.getTime() + 604_801_000).toISOString());
    const row = rowOf(await appCatalogService.publicTicker(), "AAPL");
    expect(row.price_kobo).toBeNull();
    expect(row.price_status).toBe("unavailable");
  });

  it("reports delayed prices as delayed", async () => {
    const referenceAsOf = new Date("2026-11-18T11:00:00Z");
    await makeCatalogStock({ displayTicker: "AAPL", referencePriceMicroUsd: 2_000_000n, referenceBasis: "token_nav", referenceAsOf });
    // Older than the 60 s testnet trading window but inside the 7-day display window.
    setNow("2026-11-18T12:00:00Z");
    const row = rowOf(await appCatalogService.publicTicker(), "AAPL");
    expect(row.price_status).toBe("delayed");
    expect(row.price_kobo).not.toBeNull();
  });

  it("flags SpaceX as an estimate and nothing else", async () => {
    setNow("2026-11-18T12:00:00Z");
    const rows = (await appCatalogService.publicTicker()).rows;
    expect(rows.filter((r) => r.price_is_estimate).map((r) => r.ticker)).toEqual(["SPCX"]);
  });

  it("carries the one-day line as integer strings", async () => {
    setNow("2026-11-18T12:00:00Z");
    const stock = await makeCatalogStock({ displayTicker: "AAPL", referencePriceMicroUsd: 2_000_000n, referenceBasis: "token_nav", referenceAsOf: new Date() });
    const base = new Date("2026-11-18T08:00:00.000Z").getTime();
    for (let i = 0; i < 3; i++) {
      await stockHistory.record(db, stock.id, {
        priceMicroUsd: BigInt(100_000_000 + i * 1_000_000),
        basis: "token_nav",
        asOf: new Date(base + i * 900_000),
        multiplierWad: 10n ** 18n,
      }, { kobo: 1_550_000n, microUsd: 1_000_000n });
    }
    const row = rowOf(await appCatalogService.publicTicker(), "AAPL");
    expect(row.line_kobo.length).toBeGreaterThanOrEqual(2);
    for (const v of row.line_kobo) expect(v).toMatch(/^\d+$/);
  });

  it("leaks no internal vocabulary and dates the newest price", async () => {
    setNow("2026-11-18T12:00:00Z");
    await makeCatalogStock({ displayTicker: "AAPL", referencePriceMicroUsd: 2_000_000n, referenceBasis: "token_nav", referenceAsOf: new Date("2026-11-18T11:59:00Z") });
    await makeCatalogStock({ displayTicker: "NVDA", referencePriceMicroUsd: 3_000_000n, referenceBasis: "token_nav", referenceAsOf: new Date("2026-11-18T11:30:00Z") });
    const dto = await appCatalogService.publicTicker();
    expect(findCustomerLeaks(dto)).toEqual([]);
    expect(dto.as_of).toBe(newestPriceAsOf(dto.rows));
    expect(dto.as_of).toBe("2026-11-18T11:59:00.000Z");
  });
});
