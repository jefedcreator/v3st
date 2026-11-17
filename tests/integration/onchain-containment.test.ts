import { describe, expect, it, vi } from "vitest";
import { TESTNET_CHAIN_ID, assertChainIdAllowed, parseRpcEndpoint, assertOnchainContext } from "@/backend/integrations/onchain-policy";
import { operationsService } from "@/backend/services/operations";
import { readManifest, testnetService } from "@/backend/services/onchain/testnet";
import { testnet } from "../helpers/testnet";

// Assertions run in optimized-build mode as well as in normal test mode. The
// client transport permits loopback only; remote requests fail before a socket.
describe("optimized beta containment", () => {
  it("retains local provenance and rejects mainnet and forged modes in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_STAGE", "beta");
    try {
      const handle = await testnet();
      const context = await testnetService.defaultContext("o1", "replica-1", "fixture-profile");
      expect(context).toMatchObject({ mode: "simulated", chainId: 31337, integrationKind: "local_testnet_replica" });
      expect(await testnetService.verify(readManifest())).toMatchObject({ ok: true });
      expect(() => assertOnchainContext({ ...context, chainId: 8453 })).toThrow();
      expect(() => assertOnchainContext({ ...context, mode: "sandbox" })).toThrow();
      expect(() => parseRpcEndpoint("https://mainnet.base.org", TESTNET_CHAIN_ID)).toThrow();
      expect(await handle.chainId()).toBe(31337);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reports Hydrex as verified only when Base Sepolia is configured, and never the other five", async () => {
    delete process.env.BASE_SEPOLIA_RPC_URL;
    const rows = await operationsService.integrations();
    expect(rows.every((r) => r.actual_integration === "disabled_unverified")).toBe(true);
    expect(rows.every((r) => r.verified_chain_id === null)).toBe(true);
    expect(() => assertChainIdAllowed(8453)).toThrow(/mainnet/i);
  });
});
