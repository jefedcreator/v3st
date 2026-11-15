import { describe, expect, it } from "vitest";

import {
  ReferenceParseError,
  evaluateReference,
  stockReference,
} from "@/backend/services/stocks/reference";
import { WAD } from "@/backend/services/stocks/corporate-actions";

import fixture from "../fixtures/onchain/base-stocks.json";

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
