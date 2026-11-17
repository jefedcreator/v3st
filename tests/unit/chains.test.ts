import { describe, expect, it } from "vitest";

import { TESTNET_CHAIN_ID } from "@/backend/integrations/onchain-policy";
import { __setRpcTransportForTests, chainTarget, keeperOn, relayerOn } from "@/backend/services/onchain/chains";
import { currentBlockNumber } from "@/backend/services/execution/nonce";
import { txExists } from "@/backend/services/execution/receipts";

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

  it("routes raw receipt lookups for Base Sepolia to the Sepolia endpoint only", async () => {
    process.env.BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
    const seen: string[] = [];
    __setRpcTransportForTests((url) => {
      seen.push(url);
      throw new Error("offline");
    });
    try {
      await expect(txExists(`0x${"ab".repeat(32)}`, 84532)).rejects.toThrow("offline");
      expect(seen.every((url) => url === "https://sepolia.base.org")).toBe(true);
      expect(seen.length).toBeGreaterThan(0);
    } finally {
      __setRpcTransportForTests(null);
      delete process.env.BASE_SEPOLIA_RPC_URL;
    }
  });

  it("accepts a fresh key as the keeper but never the relayer, local or Anvil keys", () => {
    const relayer = `0x${"33".repeat(32)}`;
    process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY = relayer;
    try {
      process.env.BASE_SEPOLIA_KEEPER_PRIVATE_KEY = relayer;
      expect(() => keeperOn(84532)).toThrow(/differ/i);
      const local = `0x${"22".repeat(32)}`;
      const previousLocal = process.env.TESTNET_SIGNER_PRIVATE_KEY;
      process.env.TESTNET_SIGNER_PRIVATE_KEY = local;
      process.env.BASE_SEPOLIA_KEEPER_PRIVATE_KEY = local;
      expect(() => keeperOn(84532)).toThrow(/differ/i);
      if (previousLocal === undefined) delete process.env.TESTNET_SIGNER_PRIVATE_KEY;
      else process.env.TESTNET_SIGNER_PRIVATE_KEY = previousLocal;
      process.env.BASE_SEPOLIA_KEEPER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      expect(() => keeperOn(84532)).toThrow(/differ/i);
      process.env.BASE_SEPOLIA_KEEPER_PRIVATE_KEY = `0x${"55".repeat(32)}`;
      expect(keeperOn(84532).address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(() => keeperOn(31337)).toThrow(/Base Sepolia only/i);
    } finally {
      delete process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY;
      delete process.env.BASE_SEPOLIA_KEEPER_PRIVATE_KEY;
    }
  });

  it("refuses the local test key or a public Anvil key as the Base Sepolia relayer", () => {
    const local = `0x${"22".repeat(32)}`;
    const previousLocal = process.env.TESTNET_SIGNER_PRIVATE_KEY;
    process.env.TESTNET_SIGNER_PRIVATE_KEY = local;
    try {
      process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY = local;
      expect(() => relayerOn(84532)).toThrow(/fresh testnet-only key/i);
      process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      expect(() => relayerOn(84532)).toThrow(/fresh testnet-only key/i);
    } finally {
      if (previousLocal === undefined) delete process.env.TESTNET_SIGNER_PRIVATE_KEY;
      else process.env.TESTNET_SIGNER_PRIVATE_KEY = previousLocal;
      delete process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY;
    }
  });
});
