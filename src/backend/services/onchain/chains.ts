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

export function relayerOn(chainId: number): PrivateKeyAccount {
  if (chainId === TESTNET_CHAIN_ID) return relayerAccount();
  if (chainId === BASE_SEPOLIA_CHAIN_ID) {
    const key = process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY;
    if (!key) {
      throw new OnchainPolicyError("BASE_SEPOLIA_RELAYER_PRIVATE_KEY is not configured");
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

function chainObject(chainId: number) {
  return {
    id: chainId,
    name: chainId === TESTNET_CHAIN_ID ? "v3st-local-anvil" : "base-sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [chainTarget(chainId).rpcUrl] } },
  } as const;
}

const publicClients = new Map<number, PublicClient>();

export function publicClientOn(chainId: number): PublicClient {
  if (chainId === TESTNET_CHAIN_ID) return publicClientFor() as PublicClient;
  const cached = publicClients.get(chainId);
  if (cached) return cached;
  const target = chainTarget(chainId);
  const client = createPublicClient({
    pollingInterval: 250,
    cacheTime: 0,
    // External targets fail closed: no automatic retries against a non-loopback RPC.
    retryCount: 0,
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
  if (chainId === TESTNET_CHAIN_ID) return walletClientFor(relayerOn(chainId)) as WalletClient;
  const cached = walletClients.get(chainId);
  if (cached) return cached;
  const target = chainTarget(chainId);
  const client = createWalletClient({
    account: relayerOn(chainId),
    pollingInterval: 250,
    cacheTime: 0,
    retryCount: 0,
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
