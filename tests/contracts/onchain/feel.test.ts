import { describe, expect, it } from "vitest";

import { onchainRegistry, UnverifiedProviderError } from "@/backend/services/onchain/registry";
import { feelProviderDescriptor, FEEL_SCHEMA_VERSION, parseFeelClaim } from "@/backend/services/onchain/providers/feel";
import "@/backend/services/onchain/providers";

const valid = {
  schemaVersion: FEEL_SCHEMA_VERSION,
  epochKey: "0x" + "12".repeat(32),
  launchToken: "0x2222222222222222222222222222222222222222",
  rewardAsset: "testnet:31337:0x3333333333333333333333333333333333333333",
  entitlement: "0",
};

describe("feel replica schema and descriptor", () => {
  it("parses a synthetic claim payload; a stock-only holder has zero entitlement", () => {
    const parsed = parseFeelClaim(valid);
    expect(parsed.entitlement).toBe(0n);
    expect(parsed.launchToken).toBe("0x2222222222222222222222222222222222222222");
  });

  it("rejects foreign schema versions and bad assets", () => {
    expect(() => parseFeelClaim({ ...valid, schemaVersion: "v3st-feel-distribution-replica/2" })).toThrow();
    expect(() => parseFeelClaim({ ...valid, rewardAsset: "not-an-asset" })).toThrow();
  });

  it("declares distributions but no spot capability, and a disabled actual factory", () => {
    expect(feelProviderDescriptor.capabilities.distributions).toBe(true);
    expect(feelProviderDescriptor.capabilities.spot).toBe(false);
    expect(feelProviderDescriptor.realProviderCalls).toEqual([]);
    expect(() => feelProviderDescriptor.actualFactory()).toThrow(UnverifiedProviderError);
    expect(onchainRegistry.describe("feel", "spot")).toBeNull();
  });
});
