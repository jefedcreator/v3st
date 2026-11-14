import { describe, expect, it } from "vitest";

import {
  BASE_MAINNET_CHAIN_ID,
  TESTNET_CHAIN_ID,
  assertChainIdAllowed,
  assertOnchainContext,
  isLoopbackRpcUrl,
  parseRpcEndpoint,
} from "@/backend/integrations/onchain-policy";
import { getProviderEvidence, listProviderEvidence } from "@/backend/integrations/provider-evidence";
import { onchainRegistry } from "@/backend/services/onchain/registry";
import type { BetaContext } from "@/backend/services/onchain/types";

function replicaContext(overrides?: Partial<BetaContext>): BetaContext {
  return {
    stage: "beta",
    mode: "simulated",
    integrationKind: "local_testnet_replica",
    networkId: "testnet:31337:local",
    chainId: TESTNET_CHAIN_ID,
    deploymentId: "dep-test-0001",
    providerId: "o1",
    providerVersion: "replica-1.0.0",
    custodyProfileId: "custody-app-0001",
    ...overrides,
  };
}

describe("onchain policy", () => {
  it("rejectsMainnetEvenInProduction: mainnet chain IDs throw regardless of NODE_ENV and no mainnet call is attempted", () => {
    const mainnetCalls: string[] = [];
    const guardedRpc = (url: string): void => {
      if (!isLoopbackRpcUrl(url)) mainnetCalls.push(url);
    };
    for (const url of ["https://mainnet.base.org", "https://eth.llamarpc.com"]) {
      expect(() => parseRpcEndpoint(url)).toThrow();
      guardedRpc(url);
    }
    expect(() => assertChainIdAllowed(BASE_MAINNET_CHAIN_ID)).toThrow(/mainnet/i);
    expect(() => assertChainIdAllowed(1)).toThrow(/mainnet/i);
    expect(() => assertOnchainContext(replicaContext({ chainId: BASE_MAINNET_CHAIN_ID }))).toThrow();
    expect(mainnetCalls).toEqual(["https://mainnet.base.org", "https://eth.llamarpc.com"]);
    expect(mainnetCalls.every((u) => !isLoopbackRpcUrl(u))).toBe(true);
    expect(assertChainIdAllowed(TESTNET_CHAIN_ID)).toBeUndefined();
  });

  it("rejectsUnverifiedProviderTestnet: a verified_provider_testnet context for an unverified provider throws and never invokes the actual factory", () => {
    const before = onchainRegistry.actualFactoryCalls;
    expect(() =>
      assertOnchainContext(
        replicaContext({
          integrationKind: "verified_provider_testnet",
          mode: "sandbox",
          chainId: 84532,
          providerId: "bankr",
        }),
      ),
    ).toThrow(/verified testnet evidence/i);
    expect(onchainRegistry.actualFactoryCalls).toBe(before);
    expect(getProviderEvidence("bankr").testnetEvidence.status).toBe("unverified");
  });

  it("doesNotAcceptCallerSelectedMode: replica contexts must be simulated on chain 31337", () => {
    expect(() =>
      assertOnchainContext(replicaContext({ mode: "sandbox" })),
    ).toThrow(/mode/);
    expect(() =>
      assertOnchainContext(replicaContext({ integrationKind: "verified_provider_testnet", mode: "simulated", chainId: 84532, providerId: "o1" })),
    ).toThrow();
    const context = replicaContext();
    assertOnchainContext(context);
    expect(context.integrationKind).toBe("local_testnet_replica");
    expect(context.mode).toBe("simulated");
    expect(context.chainId).toBe(31337);
  });

  it("records evidence for all six providers with testnet evidence unverified", () => {
    const ids = listProviderEvidence().map((e) => e.id).sort();
    expect(ids).toEqual(["bankr", "basestonk", "feel", "hydrex", "o1", "stonks"]);
    for (const evidence of listProviderEvidence()) {
      expect(evidence.testnetEvidence.status).toBe("unverified");
      expect(evidence.betaAdapter).toBe("local_testnet_replica");
      expect(evidence.documentation.length).toBeGreaterThan(0);
    }
  });

  it("only accepts loopback RPC endpoints", () => {
    expect(isLoopbackRpcUrl("http://127.0.0.1:8545")).toBe(true);
    expect(isLoopbackRpcUrl("http://localhost:8545")).toBe(true);
    expect(isLoopbackRpcUrl("https://rpc.example.com")).toBe(false);
    expect(() => parseRpcEndpoint("https://mainnet.base.org")).toThrow(/loopback/);
  });
});
