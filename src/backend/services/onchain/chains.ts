import { createPublicClient, createWalletClient, custom, type Hex, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

import { policy } from "@/backend/config/policy";
import {
  BASE_SEPOLIA_CHAIN_ID,
  OnchainPolicyError,
  TESTNET_CHAIN_ID,
  assertChainIdAllowed,
  parseRpcEndpoint,
} from "@/backend/integrations/onchain-policy";

import { manifestFor, verifyManifest } from "./manifests";
import { publicClientFor, relayerAccount, rpcRequest, testnetRpcUrl, walletClientFor } from "./testnet";
import type { BetaContext, StockProviderId } from "./types";

export type ChainTarget = { chainId: number; rpcUrl: string; confirmations: number; canMine: boolean };

export function chainTarget(chainId: number): ChainTarget {
  assertChainIdAllowed(chainId);
  const confirmations = policy.onchain.confirmations[chainId];
  if (confirmations === undefined) {
    throw new OnchainPolicyError(`Chain ${chainId} has no confirmation policy`);
  }
  if (chainId === TESTNET_CHAIN_ID) {
    return { chainId, rpcUrl: testnetRpcUrl(), confirmations, canMine: true };
  }
  if (chainId === BASE_SEPOLIA_CHAIN_ID) {
    const url = process.env.BASE_SEPOLIA_RPC_URL;
    if (!url) {
      throw new OnchainPolicyError("Base Sepolia RPC is not configured (BASE_SEPOLIA_RPC_URL unset)");
    }
    const endpoint = parseRpcEndpoint(url, chainId);
    return { chainId, rpcUrl: endpoint.url, confirmations, canMine: false };
  }
  throw new OnchainPolicyError(`Chain ${chainId} has no RPC target policy`);
}

// The first Anvil/Hardhat development keys (public, derived from the "test test …
// junk" mnemonic).
const ANVIL_DEV_KEYS = new Set([
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
]);

export function relayerOn(chainId: number): PrivateKeyAccount {
  if (chainId === TESTNET_CHAIN_ID) return relayerAccount();
  if (chainId === BASE_SEPOLIA_CHAIN_ID) {
    const key = process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY;
    if (!key) {
      throw new OnchainPolicyError("BASE_SEPOLIA_RELAYER_PRIVATE_KEY is not configured");
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
      throw new OnchainPolicyError("BASE_SEPOLIA_RELAYER_PRIVATE_KEY must be 0x followed by 64 hex characters");
    }
    // The public-testnet relayer is never the local test key (and never a well-known
    // Anvil development key, which anyone can drain on a public network).
    const normalized = key.toLowerCase();
    const localKey = process.env.TESTNET_SIGNER_PRIVATE_KEY?.toLowerCase();
    if ((localKey && normalized === localKey) || ANVIL_DEV_KEYS.has(normalized)) {
      throw new OnchainPolicyError("BASE_SEPOLIA_RELAYER_PRIVATE_KEY must be a fresh testnet-only key, not the local test key");
    }
    return privateKeyToAccount(key as Hex);
  }
  throw new OnchainPolicyError(`Chain ${chainId} has no relayer policy`);
}

type RpcTransport = (url: string, chainId: number, method: string, params: unknown[]) => Promise<unknown>;

let transportOverride: RpcTransport | null = null;

export function __setRpcTransportForTests(fn: RpcTransport | null): void {
  transportOverride = fn;
}

// Drops cached per-chain clients and chain-ID verifications so a test can swap
// in a fresh node (new relayer key, new loopback URL) for the same chain.
export function __resetChainClientsForTests(): void {
  publicClients.clear();
  walletClients.clear();
  verifiedChains.clear();
}

function rpcVia(url: string, chainId: number, method: string, params: unknown[]): Promise<unknown> {
  if (transportOverride) return transportOverride(url, chainId, method, params);
  return rpcRequest(url, chainId, method, params);
}

const verifiedChains = new Set<number>();

// The node's reported chain ID must match the target on first use; the check result
// is cached per chain so steady-state calls pay nothing.
async function ensureChainVerified(url: string, chainId: number): Promise<void> {
  if (chainId === TESTNET_CHAIN_ID || verifiedChains.has(chainId)) return;
  const reported = (await rpcVia(url, chainId, "eth_chainId", [])) as Hex;
  if (Number(BigInt(reported)) !== chainId) {
    throw new OnchainPolicyError(`RPC at ${url} reports chain ${reported}, expected ${chainId}`);
  }
  verifiedChains.add(chainId);
}

// Raw JSON-RPC on a network's own endpoint, with the node's chain ID verified first
// (non-local targets). Every chain-aware caller goes through this or the *On clients,
// so a Base Sepolia operation can never read a nonce, receipt or gas price from the
// local node, or the reverse.
export async function rpcOn<T = unknown>(chainId: number, method: string, params: unknown[] = []): Promise<T> {
  const target = chainTarget(chainId);
  await ensureChainVerified(target.rpcUrl, chainId);
  return (await rpcVia(target.rpcUrl, chainId, method, params)) as T;
}

export function chainObject(chainId: number) {
  return {
    id: chainId,
    name: chainId === TESTNET_CHAIN_ID ? "v3st-local-anvil" : "base-sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [chainTarget(chainId).rpcUrl] } },
  } as const;
}

const publicClients = new Map<number, PublicClient>();

export function publicClientOn(chainId: number): PublicClient {
  if (chainId === TESTNET_CHAIN_ID) return publicClientFor();
  const cached = publicClients.get(chainId);
  if (cached) return cached;
  const target = chainTarget(chainId);
  const client = createPublicClient({
    pollingInterval: 250,
    cacheTime: 0,
    chain: chainObject(chainId),
    transport: custom(
      {
        async request({ method, params }) {
          await ensureChainVerified(target.rpcUrl, chainId);
          return rpcVia(target.rpcUrl, chainId, String(method), params as unknown[]);
        },
      },
      // External targets fail closed: no automatic retries against a non-loopback RPC.
      { retryCount: 0 },
    ),
  }) as PublicClient;
  publicClients.set(chainId, client);
  return client;
}

const walletClients = new Map<number, WalletClient>();

export function walletClientOn(chainId: number): WalletClient {
  if (chainId === TESTNET_CHAIN_ID) return walletClientFor(relayerOn(chainId));
  const cached = walletClients.get(chainId);
  if (cached) return cached;
  const target = chainTarget(chainId);
  const client = createWalletClient({
    account: relayerOn(chainId),
    pollingInterval: 250,
    cacheTime: 0,
    chain: chainObject(chainId),
    transport: custom(
      {
        async request({ method, params }) {
          await ensureChainVerified(target.rpcUrl, chainId);
          return rpcVia(target.rpcUrl, chainId, String(method), params as unknown[]);
        },
      },
      { retryCount: 0 },
    ),
  }) as WalletClient;
  walletClients.set(chainId, client);
  return client;
}

export async function contextOn(
  chainId: number,
  providerId: StockProviderId,
  providerVersion: string,
  custodyProfileId: string,
): Promise<BetaContext> {
  const manifest = manifestFor(chainId);
  const verified = await verifyManifest(chainId);
  if (!verified.ok) {
    throw new OnchainPolicyError(`Network manifest verification failed for chain ${chainId}: ${verified.reason}`);
  }
  return {
    stage: "beta",
    mode: manifest.mode,
    integrationKind: manifest.integrationKind,
    networkId: manifest.networkId,
    chainId: manifest.chainId,
    deploymentId: manifest.deploymentId,
    providerId,
    providerVersion,
    custodyProfileId,
  };
}
