import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BANKR_SCHEMA_VERSION,
  decimalStringToRaw,
  normalizeBankrSwap,
  parseBankrQuote,
  parseBankrSwapEnvelope,
  rawToDecimalString,
} from "@/backend/services/onchain/providers/bankr";

const fixture = JSON.parse(
  readFileSync(`${process.cwd()}/tests/contracts/fixtures/onchain/bankr-swap.json`, "utf8"),
) as Record<string, unknown>;

describe("bankr replica schemas", () => {
  it("parses the synthetic swap envelope and normalizes a submitted fill", () => {
    const parsed = parseBankrSwapEnvelope(fixture);
    expect(parsed.httpStatus).toBe(200);
    expect(parsed.body.success).toBe(true);
    expect(parsed.body.status).toBe("submitted");
    const normalized = normalizeBankrSwap(fixture);
    expect(normalized.settled).toBe(true);
    expect(normalized.reverted).toBe(false);
    expect(normalized.unresolved).toBe(false);
    expect(normalized.txHash).toBe((fixture.body as { txHash: string }).txHash);
  });

  it("normalizes HTTP 200 with success:false as a revert, never a fill", () => {
    const body = fixture.body as Record<string, unknown>;
    const reverted = { ...fixture, body: { ...body, success: false, status: "reverted" } };
    const normalized = normalizeBankrSwap(reverted);
    expect(normalized.settled).toBe(false);
    expect(normalized.reverted).toBe(true);
    expect(normalized.unresolved).toBe(false);
  });

  it("normalizes an ambiguous gateway response as unresolved, not settled", () => {
    const body = fixture.body as Record<string, unknown>;
    const ambiguous = { ...fixture, body: { ...body, success: false, status: "unresolved" } };
    const normalized = normalizeBankrSwap(ambiguous);
    expect(normalized.settled).toBe(false);
    expect(normalized.reverted).toBe(false);
    expect(normalized.unresolved).toBe(true);
  });

  it("converts decimal strings to raw units exactly and rejects inexact values", () => {
    expect(decimalStringToRaw("10.000000", 6)).toBe(10_000_000n);
    expect(decimalStringToRaw("0.5", 18)).toBe(500_000_000_000_000_000n);
    expect(decimalStringToRaw("2487.475249621266268", 18)).toBe(2487475249621266268000n);
    expect(rawToDecimalString(decimalStringToRaw("2487.475249621266268", 18), 18)).toBe("2487.475249621266268");
    expect(() => decimalStringToRaw("1.0000001", 6)).toThrow(/fractional/i);
    expect(() => decimalStringToRaw("-1", 6)).toThrow();
    expect(() => decimalStringToRaw("1.5", 0)).toThrow(/fractional/i);
    expect(() => decimalStringToRaw("1", 78)).toThrow();
  });

  it("parses the fixture quote with exact raw conversion and separate location clearance", () => {
    const body = fixture.body as { quote: unknown };
    const quote = parseBankrQuote(body.quote);
    expect(quote.schemaVersion).toBe(BANKR_SCHEMA_VERSION);
    expect(quote.chainId).toBe(31337);
    expect(quote.input.raw).toBe(10_000_000n);
    expect(quote.fee.raw).toBe(50_000n);
    expect(quote.fee.bps).toBe(50);
    expect(quote.locationClearance).toBe("required_separately");
  });

  it("rejects non-uuid operation ids and foreign schema versions", () => {
    const body = fixture.body as Record<string, unknown>;
    expect(() => parseBankrSwapEnvelope({ ...fixture, body: { ...body, operationId: "not-a-uuid" } })).toThrow();
    expect(() => parseBankrSwapEnvelope({ ...fixture, body: { ...body, schemaVersion: "bankr-wallet-api/2" } })).toThrow();
    expect(() => parseBankrSwapEnvelope({ ...fixture, httpStatus: 500 })).toThrow();
  });
});
