import { describe, expect, it } from "vitest";

import { onchainRegistry } from "@/backend/services/onchain/registry";
import { stonksProviderDescriptor, parseStonksClaim, STONKS_SCHEMA_VERSION } from "@/backend/services/onchain/providers/stonks";
import "@/backend/services/onchain/providers";
import { UnverifiedProviderError } from "@/backend/services/onchain/registry";

const valid = {
  schemaVersion: STONKS_SCHEMA_VERSION,
  epochKey: "0x" + "ab".repeat(32),
  generation: 2,
  rewardAsset: "testnet:31337:0x1111111111111111111111111111111111111111",
  entitlement: "100000000000000000000",
};

describe("stonks replica schema and descriptor", () => {
  it("parses a synthetic claim payload with exact raw entitlement", () => {
    const parsed = parseStonksClaim(valid);
    expect(parsed.entitlement).toBe(100n * 10n ** 18n);
    expect(parsed.generation).toBe(2);
  });

  it("rejects foreign schema versions and malformed keys", () => {
    expect(() => parseStonksClaim({ ...valid, schemaVersion: "v3st-stonks-distribution-replica/2" })).toThrow();
    expect(() => parseStonksClaim({ ...valid, epochKey: "0x1234" })).toThrow();
    expect(() => parseStonksClaim({ ...valid, entitlement: "1.5" })).toThrow();
  });

  it("declares distributions but no spot capability, and a disabled actual factory", () => {
    expect(stonksProviderDescriptor.capabilities.distributions).toBe(true);
    expect(stonksProviderDescriptor.capabilities.spot).toBe(false);
    expect(stonksProviderDescriptor.realProviderCalls).toEqual([]);
    expect(() => stonksProviderDescriptor.actualFactory()).toThrow(UnverifiedProviderError);
    expect(onchainRegistry.describe("stonks", "strategy")?.distributions).toBe(true);
    expect(onchainRegistry.describe("stonks", "spot")).toBeNull();
  });
});
