import { describe, expect, it } from "vitest";

import { onchainRegistry, UnverifiedProviderError } from "@/backend/services/onchain/registry";
import {
  basestonkProviderDescriptor,
  BASESTONK_SCHEMA_VERSION,
  parseBaseStonkFee,
} from "@/backend/services/onchain/providers/basestonk";
import "@/backend/services/onchain/providers";

const valid = {
  schemaVersion: BASESTONK_SCHEMA_VERSION,
  launchId: "0x" + "cd".repeat(32),
  hookVersion: "0x" + "ef".repeat(32),
  feeBps: 25,
  feeAsset: "testnet:31337:0x1111111111111111111111111111111111111111",
  pendingFees: "50000",
};

describe("basestonk replica schema and descriptor", () => {
  it("parses a synthetic hook-fee payload (V3ST replica definition)", () => {
    const parsed = parseBaseStonkFee(valid);
    expect(parsed.pendingFees).toBe(50_000n);
    expect(parsed.feeBps).toBe(25);
  });

  it("rejects unknown schema versions and out-of-range bps", () => {
    expect(() => parseBaseStonkFee({ ...valid, schemaVersion: "v3st-hook-fee-replica/9" })).toThrow();
    expect(() => parseBaseStonkFee({ ...valid, feeBps: 10_001 })).toThrow();
  });

  it("declares distributions but no spot capability, and a disabled actual factory", () => {
    expect(basestonkProviderDescriptor.capabilities.distributions).toBe(true);
    expect(basestonkProviderDescriptor.capabilities.spot).toBe(false);
    expect(basestonkProviderDescriptor.realProviderCalls).toEqual([]);
    expect(() => basestonkProviderDescriptor.actualFactory()).toThrow(UnverifiedProviderError);
    expect(onchainRegistry.describe("basestonk", "spot")).toBeNull();
  });
});
