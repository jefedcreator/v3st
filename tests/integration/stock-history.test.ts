import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { __setStocksFetchForTests } from "@/backend/services/stocks/base-stocks-client";
import { stockHistory } from "@/backend/services/stocks/history";
import { stockService } from "@/backend/services/stocks";
import { ratesService } from "@/backend/services/rates";
import { investmentService } from "@/backend/services/investments";
import { kycService } from "@/backend/services/kyc";
import { db } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { makeUserWithWallets } from "../helpers/factories";
import { makeTestnetStock } from "../helpers/testnet";
import { setNow } from "../helpers/time";

useTestDatabase();

const RATE = { kobo: 1_550_000n, microUsd: 1_000_000n };

describe("stock price history", () => {
  it("keeps one row per reference time and buckets series points", async () => {
    const { stock } = await makeTestnetStock({ symbol: "HIST" });
    const base = new Date("2026-11-17T10:00:00.000Z").getTime();
    for (let i = 0; i < 8; i++) {
      await stockHistory.record(db, stock.id, {
        priceMicroUsd: BigInt(100_000_000 + i),
        basis: "token_nav",
        asOf: new Date(base + i * 60_000),
        multiplierWad: 10n ** 18n,
      }, RATE);
    }
    expect(await db.stockPriceSnapshot.count({ where: { stockId: stock.id } })).toBe(8);
    await stockHistory.record(db, stock.id, {
      priceMicroUsd: 200_000_000n,
      basis: "token_nav",
      asOf: new Date(base),
      multiplierWad: 10n ** 18n,
    }, RATE);
    expect(await db.stockPriceSnapshot.count({ where: { stockId: stock.id } })).toBe(8);

    const series = await stockHistory.series(stock.id, "1D", new Date(base + 8 * 60_000));
    // All 8 snapshots fall inside one 15-minute bucket: one point, the last price.
    expect(series).toHaveLength(1);
    expect(series[0]!.priceMicroUsd).toBe(100_000_007n);
    expect(series[0]!.rate).toEqual(RATE);
  });

  it("returns the newest snapshot at or before a time", async () => {
    const { stock } = await makeTestnetStock({ symbol: "BEFORE" });
    const base = new Date("2026-11-17T10:00:00.000Z").getTime();
    for (const [offset, price] of [[0, 100n], [3_600_000, 200n], [7_200_000, 300n]] as const) {
      await stockHistory.record(db, stock.id, {
        priceMicroUsd: price,
        basis: "token_nav",
        asOf: new Date(base + offset),
        multiplierWad: 10n ** 18n,
      }, null);
    }
    const before = await stockHistory.priceBefore(stock.id, new Date(base + 4_000_000));
    expect(before?.priceMicroUsd).toBe(200n);
    expect(before?.asOf).toEqual(new Date(base + 3_600_000));
    expect(before?.rate).toBeNull();
    expect(await stockHistory.priceBefore(stock.id, new Date(base - 1))).toBeNull();
  });

  it("records a snapshot for each updated stand-in row on reference sync", async () => {
    const fixtureDir = path.resolve(import.meta.dirname, "../contracts/fixtures/onchain");
    const liveFixture = JSON.parse(readFileSync(path.join(fixtureDir, "base-stocks-live.json"), "utf8")) as {
      tokens: Record<string, unknown>[];
    };
    const navEntry = liveFixture.tokens.find((t) => t.symbol === "NVDAc")!;
    const navAssetKey = `base:8453:${String(navEntry.contract_address).toLowerCase()}`;
    await db.stock.create({
      data: {
        symbol: "tNVDA",
        assetKey: null,
        name: "NVIDIA Inc. (test token)",
        chain: "basesepolia",
        tokenAddress: "0x0000000000000000000000000000000000000abc",
        decimals: 18,
        enabled: true,
        simPriceMicroUsdc: 100_000_000n,
        simWeeklyEarningMicroPerShare: 0n,
        provenance: { standInFor: navAssetKey },
      } as never,
    });
    let pages = 0;
    __setStocksFetchForTests(async () => {
      pages += 1;
      return pages === 1 ? liveFixture : { tokens: [] };
    });
    try {
      const result = await stockService.syncReference();
      expect(result.updated).toBe(1);
      const snapshots = await db.stockPriceSnapshot.findMany();
      expect(snapshots).toHaveLength(1);
      const payout = (await ratesService.display()).payoutRate;
      expect(snapshots[0]!.rateKobo).toBe(payout.kobo);
      expect(snapshots[0]!.rateMicroUsd).toBe(payout.microUsd);
      const row = await db.stock.findFirstOrThrow({ where: { symbol: "tNVDA" } });
      expect(snapshots[0]!.stockId).toBe(row.id);
      expect(snapshots[0]!.priceMicroUsd).toBe(row.referencePriceMicroUsd);
      expect(snapshots[0]!.asOf).toEqual(row.referenceAsOf);
    } finally {
      __setStocksFetchForTests(null);
    }
  });

  it("rejects a quote on a stale testnet reference with REFERENCE_STALE", async () => {
    const user = await makeUserWithWallets();
    await kycService.verify(user.id, { persona: "ada_tier2" });
    const { stock } = await makeTestnetStock({ symbol: "STALE", referencePriceMicroUsd: 250_000_000n });
    setNow(new Date(Date.now() + 61_000).toISOString());
    await expect(
      investmentService.quote(user.id, { stockId: stock.id, side: "buy", budgetNgn: 150_000n }),
    ).rejects.toMatchObject({ code: "REFERENCE_STALE" });
  });
});
