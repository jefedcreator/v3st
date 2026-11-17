import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Address, Hex } from "viem";

import { BASE_SEPOLIA_CHAIN_ID, TESTNET_CHAIN_ID } from "@/backend/integrations/onchain-policy";
import { sha256Hex } from "@/utils";

import { rpcOn } from "./chains";
import { manifestDir, readManifest, settlementAssetKey, testnetService, TestnetError, type TestnetManifest } from "./testnet";
import type { IntegrationKind } from "./types";

// A network manifest records every contract of one deployment. External (provider-owned)
// contracts carry a code hash so a changed deployment fails closed instead of executing.
export type NetworkManifest = Omit<TestnetManifest, "integrationKind" | "mode"> & {
  integrationKind: IntegrationKind;
  mode: "sandbox" | "simulated";
  external: Record<string, { address: Address; codeHash: string }>;
  // Catalog revision of the deployment (2 = multi-ticker stand-ins).
  catalogVersion?: number;
};

export function manifestPathFor(chainId: number): string {
  if (chainId === TESTNET_CHAIN_ID) return path.join(manifestDir(), "manifest.json");
  if (chainId === BASE_SEPOLIA_CHAIN_ID) return path.join(manifestDir(), "base-sepolia", "manifest.json");
  throw new TestnetError(`No manifest policy for chain ${chainId}`);
}

export function manifestFor(chainId: number): NetworkManifest {
  if (chainId === TESTNET_CHAIN_ID) {
    const manifest = readManifest();
    return { ...manifest, external: {} };
  }
  const file = manifestPathFor(chainId);
  if (!existsSync(file)) {
    throw new TestnetError(`No manifest for chain ${chainId} at ${file}; run the network deploy script first`);
  }
  const manifest = JSON.parse(readFileSync(file, "utf8")) as NetworkManifest;
  if (manifest.chainId !== chainId) {
    throw new TestnetError(`Manifest at ${file} declares chain ${manifest.chainId}, expected ${chainId}`);
  }
  return manifest;
}

// The settlement (test USDC) asset key of a network's deployment. Base Sepolia keys
// use the "basesepolia" namespace: basesepolia:84532:<lowercase address>.
export function settlementAssetKeyOn(chainId: number): string {
  if (chainId === TESTNET_CHAIN_ID) return settlementAssetKey(readManifest());
  const entry = manifestFor(chainId).contracts.TestSettlementToken;
  if (!entry) throw new TestnetError(`Manifest for chain ${chainId} has no TestSettlementToken`);
  return `basesepolia:${chainId}:${entry.address.toLowerCase()}`;
}

// The ledger "chain" namespace of a network: the local replica posts under
// policy.onchain.networkNamespace ("testnet"), Base Sepolia under "basesepolia"
// (the same namespace as its asset keys and Stock.chain), so per-network cash and
// reconciliation never mix balances of two chains.
export function ledgerChainFor(chainId: number): string {
  if (chainId === TESTNET_CHAIN_ID) return "testnet";
  if (chainId === BASE_SEPOLIA_CHAIN_ID) return "basesepolia";
  throw new TestnetError(`No ledger namespace for chain ${chainId}`);
}

export async function verifyManifest(chainId: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (chainId === TESTNET_CHAIN_ID) {
    const verified = await testnetService.verify(readManifest());
    return verified.ok ? { ok: true } : { ok: false, reason: verified.reason ?? "unknown" };
  }
  let manifest: NetworkManifest;
  try {
    manifest = manifestFor(chainId);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "manifest unreadable" };
  }
  try {
    // rpcOn routes through the shared per-chain transport (and the chain-ID check),
    // so non-local chains go through their own endpoint and the test transport applies.
    const reported = await rpcOn<Hex>(chainId, "eth_chainId");
    if (Number(BigInt(reported)) !== chainId) {
      return { ok: false, reason: `node reports chain ${reported}, expected ${chainId}` };
    }
    const contracts: Record<string, { address: Address; codeHash?: string }> = { ...manifest.contracts };
    for (const [name, entry] of Object.entries(manifest.external)) {
      contracts[name] = { address: entry.address, codeHash: entry.codeHash };
    }
    for (const [name, entry] of Object.entries(contracts)) {
      const code = await rpcOn<Hex>(chainId, "eth_getCode", [entry.address, "latest"]);
      if (!code || code === "0x") return { ok: false, reason: `contract ${name} missing at ${entry.address}` };
      if (entry.codeHash && sha256Hex(code) !== entry.codeHash) {
        return { ok: false, reason: `contract ${name} code hash mismatch at ${entry.address}` };
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "rpc unavailable" };
  }
}
