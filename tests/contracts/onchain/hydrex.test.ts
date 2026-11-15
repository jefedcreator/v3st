import { describe, expect, it } from "vitest";

import { onchainRegistry } from "@/backend/services/onchain/registry";
import {
  HYDREX_FIXTURE_FEE_BPS,
  HYDREX_SCHEMA_VERSION,
  hydrexExitRealizedStrategyReplica,
  hydrexSpotReplica,
  hydrexStrategyReplica,
  hydropumpLockerDescriptor,
  parseHydrexQuote,
} from "@/backend/services/onchain/providers/hydrex";
import "@/backend/services/onchain/providers";

const validQuote = {
  quoteId: "hydrexq-fixture-0001",
  schemaVersion: HYDREX_SCHEMA_VERSION,
  chainId: 31337,
  pool: "0x1111111111111111111111111111111111111111",
  input: { asset: "testnet:31337:0x2222222222222222222222222222222222222222", raw: "100000" },
  output: { asset: "testnet:31337:0x3333333333333333333333333333333333333333", raw: "49850" },
  minOutput: { asset: "testnet:31337:0x3333333333333333333333333333333333333333", raw: "49351" },
  fee: { asset: "testnet:31337:0x2222222222222222222222222222222222222222", raw: "30", bps: HYDREX_FIXTURE_FEE_BPS },
  priceImpactBps: 9,
  expiresAt: "2026-11-14T16:00:00.000Z",
};

describe("hydrex replica schemas and descriptors", () => {
  it("parses a synthetic pool quote with exact raw conversion", () => {
    const parsed = parseHydrexQuote(validQuote);
    expect(parsed.input.raw).toBe(100_000n);
    expect(parsed.fee.raw).toBe(30n);
    expect(parsed.fee.bps).toBe(HYDREX_FIXTURE_FEE_BPS);
    expect(parsed.pool).toBe("0x1111111111111111111111111111111111111111");
  });

  it("rejects foreign schema versions, bad raw strings and out-of-range bps", () => {
    expect(() => parseHydrexQuote({ ...validQuote, schemaVersion: "hydrex-pool-replica/2" })).toThrow();
    expect(() => parseHydrexQuote({ ...validQuote, input: { ...validQuote.input, raw: "1.5" } })).toThrow();
    expect(() => parseHydrexQuote({ ...validQuote, input: { ...validQuote.input, raw: "-3" } })).toThrow();
    expect(() => parseHydrexQuote({ ...validQuote, fee: { ...validQuote.fee, bps: 10_001 } })).toThrow();
  });

  it("declares separateClaim true for the manual-fee fixture and false for the exit-realized variant", () => {
    expect(hydrexStrategyReplica.capabilities.separateClaim).toBe(true);
    expect(hydrexExitRealizedStrategyReplica.capabilities.separateClaim).toBe(false);
    expect(hydrexSpotReplica.capabilities.liquidity).toBe(true);
    expect(hydrexSpotReplica.capabilities.spot).toBe(true);
  });

  it("declares the Hydropump locker as permanently locked with beneficiary-only fee claims", () => {
    expect(hydropumpLockerDescriptor.permanentlyLocked).toBe(true);
    expect(hydropumpLockerDescriptor.beneficiaryOnlyFeeClaims).toBe(true);
    expect(hydropumpLockerDescriptor.redeemable).toBe(false);
  });

  it("registers hydrex spot and strategy adapters with the onchain registry", () => {
    expect(onchainRegistry.describe("hydrex", "spot")?.liquidity).toBe(true);
    expect(onchainRegistry.describe("hydrex", "strategy")?.separateClaim).toBe(true);
  });
});
