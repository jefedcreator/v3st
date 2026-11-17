import { describe, expect, it } from "vitest";

import "@/backend/services/onchain/providers";
import { onchainRegistry } from "@/backend/services/onchain/registry";
import type { BetaContext, StockProviderId } from "@/backend/services/onchain/types";

function ctx(providerId: StockProviderId, verified: boolean): BetaContext {
  return {
    stage: "beta",
    mode: verified ? "sandbox" : "simulated",
    integrationKind: verified ? "verified_provider_testnet" : "local_testnet_replica",
    networkId: verified ? "basesepolia:84532" : "testnet:31337:local",
    chainId: verified ? 84532 : 31337,
    deploymentId: verified ? "dep-sepolia" : "dep-test-0001",
    providerId,
    providerVersion: verified ? "hydrex-sdk-1.2.8" : "replica-1.0.0",
    custodyProfileId: "custody-app-0001",
  };
}

describe("onchain registry", () => {
  it("returns the real Hydrex adapter on Base Sepolia and replicas elsewhere", () => {
    expect(onchainRegistry.spot("hydrex", ctx("hydrex", true)).capabilities.kind).toBe("verified_provider_testnet");
    expect(onchainRegistry.strategy("hydrex", ctx("hydrex", true)).capabilities.kind).toBe("verified_provider_testnet");
    expect(onchainRegistry.spot("hydrex", ctx("hydrex", false)).capabilities.kind).toBe("local_testnet_replica");
    expect(() => onchainRegistry.spot("o1", ctx("o1", true))).toThrow();
    expect(() => onchainRegistry.strategy("o1", ctx("o1", true))).toThrow();
  });
});
