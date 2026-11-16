import { describe, expect, it } from "vitest";

import {
  ReferenceParseError,
  decimalToRaw,
  evaluateReference,
  standInFor,
  stockReference,
} from "@/backend/services/stocks/reference";
import { __setStocksFetchForTests } from "@/backend/services/stocks/base-stocks-client";
import { stockService } from "@/backend/services/stocks";
import { WAD } from "@/backend/services/stocks/corporate-actions";
import { db } from "@/server/db";

import { useTestDatabase } from "../../helpers/db";
import fixture from "../fixtures/onchain/base-stocks.json";
import liveFixture from "../fixtures/onchain/base-stocks-live.json";

useTestDatabase();

describe("base stock reference parser", () => {
  it("parses the documented schema with pagination, decimals and price basis", () => {
    const page = stockReference.parsePage(fixture);
    expect(page.next).toBe("page-2");
    expect(page.stocks).toHaveLength(3);
    const [tsta, tstb, unkn] = page.stocks;
    expect(tsta).toMatchObject({
      assetKey: "base:8453:0x1111111111111111111111111111111111111111",
      chainId: 8453,
      symbol: "TSTA",
      decimals: 18,
      referencePriceMicroUsd: 100_000_000n,
      referenceBasis: "share_price",
      referenceAsOf: new Date("2026-11-14T12:00:00Z"),
    });
    expect(tsta?.multiplierWad).toBe(WAD);
    expect(tstb?.referenceBasis).toBe("token_nav");
    expect(tstb?.referencePriceMicroUsd).toBe(250_000_000n);
    expect(unkn?.symbol).toBe("UNKN");
  });

  it("tolerates omitted fields with explicit defaults", () => {
    const [ukn] = stockReference.parse(fixture).filter((s) => s.symbol === "UNKN");
    expect(ukn).toMatchObject({
      kind: "stock",
      issuer: "",
      rightsSummary: "",
      referencePriceMicroUsd: null,
      referenceBasis: null,
      referenceAsOf: null,
      multiplierWad: WAD,
      decimals: 8,
    });
  });

  it("rejects malformed payloads instead of guessing", () => {
    expect(() => stockReference.parse({ data: [{ chain_id: "8453", address: "0x1", symbol: "X", name: "X", decimals: 18 }] })).toThrow(ReferenceParseError);
    expect(() => stockReference.parse({ data: [{ chain_id: -1, address: "0x1111111111111111111111111111111111111111", symbol: "X", name: "X", decimals: 18 }] })).toThrow(ReferenceParseError);
    expect(() => stockReference.parse({ data: [], extra: true })).toThrow(ReferenceParseError);
  });

  it("unknown metadata is not proof of tradability", () => {
    const stocks = stockReference.parse(fixture);
    const bySymbol = new Map(stocks.map((s) => [s.symbol, s]));
    expect(evaluateReference(bySymbol.get("TSTA")!).tradable).toBe(true);
    const unkn = evaluateReference(bySymbol.get("UNKN")!);
    expect(unkn.tradable).toBe(false);
    expect(unkn.reasons).toContain("issuer_unknown");
    expect(unkn.reasons).toContain("rights_unknown");
  });
});

describe("live tokenized stocks parse", () => {
  it("parses the live response shape into reference stocks with nav prices only", () => {
    const { stocks, next } = stockReference.parseLive(liveFixture);
    expect(next).toBe(liveFixture.next_page_token ?? null);
    // The API omits nav_price when unset; those records are skipped, never zeroed.
    expect(stocks.length).toBe(2);
    for (const s of stocks) {
      expect(s.assetKey).toBe(`base:8453:${s.address}`);
      expect(s.chainId).toBe(8453);
      expect(s.multiplierWad > 0n).toBe(true);
      expect(s.referenceBasis).toBe("token_nav");
      expect(s.referencePriceMicroUsd).not.toBeNull();
    }
    const nvda = stocks.find((s) => s.symbol === "NVDAc");
    expect(nvda?.referencePriceMicroUsd).toBe(158_265_091n); // 158.26509128 truncated to 6 decimals
    expect(nvda?.multiplierWad).toBe(1_000_537_939_576_369_400n); // 1.0005379395763694 to 18 decimals
  });

  it("converts decimal multiplier and price exactly", () => {
    expect(decimalToRaw("1.5", 18)).toBe(1_500_000_000_000_000_000n);
    expect(decimalToRaw("250.123456", 6)).toBe(250_123_456n);
    expect(decimalToRaw(1, 18)).toBe(1_000_000_000_000_000_000n);
    expect(() => decimalToRaw("abc", 6)).toThrow(ReferenceParseError);
    const { stocks } = stockReference.parseLive({
      tokens: [{ ...(liveFixture.tokens as unknown[])[0], multiplier: "1.5", nav_price: "250.123456", nav_price_updated_at: "2026-11-16T00:00:00Z" }],
    });
    expect(stocks[0]!.multiplierWad).toBe(1_500_000_000_000_000_000n);
    expect(stocks[0]!.referencePriceMicroUsd).toBe(250_123_456n);
  });

  it("skips records without a published nav and rejects malformed payloads without partial results", () => {
    const withoutNav = (liveFixture.tokens as Record<string, unknown>[]).find((t) => t.nav_price === undefined)!;
    expect(stockReference.parseLive({ tokens: [withoutNav] }).stocks).toHaveLength(0);
    expect(() => stockReference.parseLive({ tokens: [{ symbol: "AAPL" }] })).toThrow(ReferenceParseError);
    expect(() => stockReference.parseLive({ data: [] })).toThrow(ReferenceParseError);
  });

  it("reads the stand-in mapping from provenance", () => {
    expect(standInFor({ provenance: { standInFor: "base:8453:0xb2" } } as never)).toBe("base:8453:0xb2");
    expect(standInFor({ provenance: null } as never)).toBeNull();
  });
});

describe("reference sync", () => {
  const navEntry = (liveFixture.tokens as Record<string, unknown>[]).find((t) => t.symbol === "NVDAc")!;
  const navAssetKey = `base:8453:${String(navEntry.contract_address).toLowerCase()}`;

  async function seedStock(overrides: Record<string, unknown> = {}) {
    return db.stock.create({
      data: {
        symbol: "NVDAc",
        assetKey: navAssetKey,
        name: "NVIDIA Corp.",
        chain: "base",
        tokenAddress: String(navEntry.contract_address).toLowerCase(),
        decimals: 8,
        enabled: true,
        simPriceMicroUsdc: 100_000_000n,
        simWeeklyEarningMicroPerShare: 0n,
        ...overrides,
      } as never,
    });
  }

  it("updates matching rows and stand-ins, never creating or enabling rows", async () => {
    await seedStock();
    await seedStock({
      symbol: "tNVDA",
      assetKey: null,
      name: "NVIDIA Inc. (test token)",
      chain: "basesepolia",
      tokenAddress: "0x0000000000000000000000000000000000000abc",
      provenance: { standInFor: navAssetKey },
    });
    let pages = 0;
    __setStocksFetchForTests(async () => {
      pages += 1;
      // The fixture carries a next_page_token; the stub ends pagination on page 2.
      return pages === 1 ? liveFixture : { tokens: [] };
    });
    try {
      const result = await stockService.syncReference();
      expect(result.updated).toBe(2);
      // SPCXc has no catalog row and no stand-in, so it is skipped, not created.
      expect(result.skipped).toBe(1);
      const rows = await db.stock.findMany({ orderBy: { symbol: "asc" } });
      for (const row of rows) {
        expect(row.referencePriceMicroUsd).toBe(158_265_091n);
        expect(row.referenceBasis).toBe("token_nav");
      }
      expect(await db.stock.count()).toBe(2);
    } finally {
      __setStocksFetchForTests(null);
    }
  });

  it("leaves the catalog untouched when the API fails", async () => {
    await seedStock();
    const before = await db.stock.findMany({ orderBy: { id: "asc" } });
    __setStocksFetchForTests(async () => {
      throw new Error("503");
    });
    try {
      await expect(stockService.syncReference()).rejects.toThrow("503");
      expect(await db.stock.findMany({ orderBy: { id: "asc" } })).toEqual(before);
    } finally {
      __setStocksFetchForTests(null);
    }
  });
});
