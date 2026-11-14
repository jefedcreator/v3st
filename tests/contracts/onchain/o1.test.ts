import { describe, expect, it } from "vitest";

import {
  O1_FIXTURE_FEE_BPS,
  O1ReplicaError,
  assertFeeConsistency,
} from "@/backend/services/onchain/providers/o1/replica";
import { O1SchemaError, parseO1Prepared, parseO1Quote } from "@/backend/services/onchain/providers/o1/schemas";

import quoteFixture from "../fixtures/onchain/o1-quote.json";
import preparedFixture from "../fixtures/onchain/o1-prepared.json";

describe("o1 documented-schema parsers", () => {
  it("parses the quote fixture exactly: raw units, fee, route, expiry", () => {
    const parsed = parseO1Quote(quoteFixture);
    expect(parsed.quoteId).toBe("o1-quote-fixture-0001");
    expect(parsed.chainId).toBe(31337);
    expect(parsed.input.raw).toBe(10_000_000n);
    expect(parsed.fee.raw).toBe(50_000n);
    expect(parsed.fee.bps).toBe(O1_FIXTURE_FEE_BPS);
    expect(parsed.minOutput.raw).toBe(4_950_000n);
    expect(parsed.route).toContain("hydrex-origin-path");
    expect(parsed.expiresAt).toBe("2026-11-14T12:00:30Z");
  });

  it("10,000,000 input with the 50-bps fixture fee reports exactly 50,000 fee, minimum from net output once", () => {
    const parsed = parseO1Quote(quoteFixture);
    assertFeeConsistency(parsed, parsed.input.raw);
    const expectedFee = (10_000_000n * BigInt(O1_FIXTURE_FEE_BPS)) / 10_000n;
    expect(expectedFee).toBe(50_000n);
    expect(parsed.fee.raw).toBe(expectedFee);
    expect(parsed.minOutput.raw).toBeLessThanOrEqual(parsed.output.raw);
  });

  it("rejectsHiddenOutputFee: strict schema rejects unknown fee fields even on HTTP 200-shaped payloads", () => {
    const tampered = {
      ...quoteFixture,
      fee: { ...quoteFixture.fee, raw: "60000" },
    };
    expect(() => assertFeeConsistency(parseO1Quote(tampered), 10_000_000n)).toThrow(O1ReplicaError);
    const withHiddenFee = {
      ...quoteFixture,
      outputFee: { asset: quoteFixture.output.asset, raw: "1000" },
    };
    expect(() => parseO1Quote(withHiddenFee)).toThrow(O1SchemaError);
  });

  it("parses the prepared unsigned transaction as construction, not confirmation", () => {
    const prepared = parseO1Prepared(preparedFixture);
    expect(prepared.kind).toBe("unsigned_transaction");
    expect(prepared.unsignedTx.to).toBe("0x0000000000000000000000000000000000000099");
    expect(prepared.unsignedTx.value).toBe("0");
    expect(prepared.note).toContain("not broadcast confirmation");
  });

  it("rejects malformed prepared payloads", () => {
    expect(() => parseO1Prepared({ ...preparedFixture, kind: "broadcast_receipt" })).toThrow(O1SchemaError);
    expect(() => parseO1Prepared({ ...preparedFixture, unsignedTx: { ...preparedFixture.unsignedTx, to: "0x123" } })).toThrow(O1SchemaError);
    expect(() => parseO1Quote({ ...quoteFixture, chainId: "31337" })).toThrow(O1SchemaError);
  });
});
