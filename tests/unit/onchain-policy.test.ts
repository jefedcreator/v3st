import { describe, expect, it } from "vitest";

import {
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
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
      expect(() => parseRpcEndpoint(url, TESTNET_CHAIN_ID)).toThrow();
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

  it("records evidence for all six providers: only hydrex is verified, on Base Sepolia", () => {
    const ids = listProviderEvidence().map((e) => e.id).sort();
    expect(ids).toEqual(["bankr", "basestonk", "feel", "hydrex", "o1", "stonks"]);
    for (const evidence of listProviderEvidence()) {
      if (evidence.id === "hydrex") {
        expect(evidence.testnetEvidence.status).toBe("verified");
        expect(evidence.testnetEvidence.chainId).toBe(BASE_SEPOLIA_CHAIN_ID);
      } else {
        expect(evidence.testnetEvidence.status).toBe("unverified");
      }
      expect(evidence.betaAdapter).toBe("local_testnet_replica");
      expect(evidence.documentation.length).toBeGreaterThan(0);
    }
  });

  it("only accepts loopback RPC endpoints on the local testnet", () => {
    expect(isLoopbackRpcUrl("http://127.0.0.1:8545")).toBe(true);
    expect(isLoopbackRpcUrl("http://localhost:8545")).toBe(true);
    expect(isLoopbackRpcUrl("https://rpc.example.com")).toBe(false);
    expect(() => parseRpcEndpoint("https://mainnet.base.org", TESTNET_CHAIN_ID)).toThrow(/loopback/);
  });

  it("allows Base Sepolia only for hydrex as a verified provider testnet", () => {
    const sepolia = replicaContext({
      integrationKind: "verified_provider_testnet",
      mode: "sandbox",
      chainId: BASE_SEPOLIA_CHAIN_ID,
      providerId: "hydrex",
      networkId: "basesepolia:84532",
    });
    expect(() => assertOnchainContext(sepolia)).not.toThrow();
    expect(() => assertOnchainContext({ ...sepolia, providerId: "o1" })).toThrow(/verified testnet evidence/i);
    expect(() =>
      assertOnchainContext({ ...sepolia, integrationKind: "local_testnet_replica", mode: "simulated" }),
    ).toThrow();
    expect(() => assertOnchainContext({ ...sepolia, chainId: BASE_MAINNET_CHAIN_ID })).toThrow();
  });

  it("accepts a non-loopback RPC only for the configured Base Sepolia host over https", () => {
    process.env.BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
    try {
      expect(parseRpcEndpoint("https://sepolia.base.org", BASE_SEPOLIA_CHAIN_ID).loopback).toBe(false);
      expect(parseRpcEndpoint("https://sepolia.base.org", BASE_SEPOLIA_CHAIN_ID).chainId).toBe(
        BASE_SEPOLIA_CHAIN_ID,
      );
      expect(() => parseRpcEndpoint("http://sepolia.base.org", BASE_SEPOLIA_CHAIN_ID)).toThrow();
      expect(() => parseRpcEndpoint("https://mainnet.base.org", BASE_SEPOLIA_CHAIN_ID)).toThrow();
      expect(() => parseRpcEndpoint("https://sepolia.base.org", TESTNET_CHAIN_ID)).toThrow();
      expect(parseRpcEndpoint("http://127.0.0.1:8545", TESTNET_CHAIN_ID).loopback).toBe(true);
      delete process.env.BASE_SEPOLIA_RPC_URL;
      expect(() => parseRpcEndpoint("https://sepolia.base.org", BASE_SEPOLIA_CHAIN_ID)).toThrow(/not configured/i);
    } finally {
      delete process.env.BASE_SEPOLIA_RPC_URL;
    }
  });
});
