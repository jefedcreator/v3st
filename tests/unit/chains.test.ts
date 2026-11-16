import { describe, expect, it } from "vitest";

import { TESTNET_CHAIN_ID } from "@/backend/integrations/onchain-policy";
import { __setRpcTransportForTests, chainTarget, relayerOn } from "@/backend/services/onchain/chains";
import { currentBlockNumber } from "@/backend/services/execution/nonce";

describe("multi-network chain access", () => {
  it("resolves each network to its own RPC, relayer and confirmations", () => {
    process.env.BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
    process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY = `0x${"11".repeat(32)}`;
    try {
      expect(chainTarget(31337)).toMatchObject({ confirmations: 2, canMine: true });
      expect(chainTarget(84532)).toMatchObject({ rpcUrl: "https://sepolia.base.org", confirmations: 3, canMine: false });
      expect(relayerOn(84532).address).not.toBe(relayerOn(TESTNET_CHAIN_ID).address);
    } finally {
      delete process.env.BASE_SEPOLIA_RPC_URL;
      delete process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY;
    }
  });

  it("fails closed when Base Sepolia is not configured or the chain is unknown", () => {
    delete process.env.BASE_SEPOLIA_RPC_URL;
    expect(() => chainTarget(84532)).toThrow(/not configured/i);
    expect(() => chainTarget(8453)).toThrow();
    expect(() => chainTarget(10)).toThrow();
  });

  it("never uses the local node for a Base Sepolia operation", async () => {
    process.env.BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
    const seen: string[] = [];
    __setRpcTransportForTests((url) => {
      seen.push(url);
      throw new Error("offline");
    });
    try {
      await expect(currentBlockNumber(84532)).rejects.toThrow("offline");
      expect(seen).toEqual(["https://sepolia.base.org"]);
    } finally {
      __setRpcTransportForTests(null);
      delete process.env.BASE_SEPOLIA_RPC_URL;
    }
  });
});
