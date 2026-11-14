import { env } from "@/env";

import type { BetaContext, IntegrationKind, StockProviderId } from "@/backend/services/onchain/types";

import { getProviderEvidence, type ProviderEvidence } from "./provider-evidence";

export const TESTNET_CHAIN_ID = 31337;
export const BASE_MAINNET_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

export class OnchainPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnchainPolicyError";
  }
}

export type RpcEndpoint = { url: string; loopback: boolean };

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function parseRpcEndpoint(url: string): RpcEndpoint {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new OnchainPolicyError(`Invalid RPC URL: ${url}`);
  }
  const loopback = LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
  if (!loopback) {
    throw new OnchainPolicyError(
      `Onchain RPC endpoints must be loopback-only in beta (got host ${parsed.hostname})`,
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new OnchainPolicyError(`Unsupported RPC protocol: ${parsed.protocol}`);
  }
  return { url, loopback };
}

export function isLoopbackRpcUrl(url: string): boolean {
  try {
    return parseRpcEndpoint(url).loopback;
  } catch {
    return false;
  }
}

export function assertBetaStage(): void {
  if (env.APP_STAGE !== "beta") {
    throw new OnchainPolicyError("Onchain integrations require APP_STAGE=beta");
  }
}

export function assertChainIdAllowed(chainId: number): void {
  if (chainId === TESTNET_CHAIN_ID) return;
  if (chainId === BASE_MAINNET_CHAIN_ID || chainId === 1) {
    throw new OnchainPolicyError(
      `Mainnet chain ${chainId} is never allowed in beta, including with NODE_ENV=production`,
    );
  }
  throw new OnchainPolicyError(
    `Chain ${chainId} is not on the beta allowlist (isolated local testnet ${TESTNET_CHAIN_ID} only)`,
  );
}

export function modeForIntegrationKind(kind: IntegrationKind): "sandbox" | "simulated" {
  return kind === "verified_provider_testnet" ? "sandbox" : "simulated";
}

export function assertOnchainContext(context: BetaContext): void {
  assertBetaStage();
  if (context.stage !== "beta") {
    throw new OnchainPolicyError("BetaContext.stage must be beta; caller-selected modes are rejected");
  }
  if (context.mode !== "sandbox" && context.mode !== "simulated") {
    throw new OnchainPolicyError(`Unknown mode ${JSON.stringify(context.mode)}`);
  }
  const expectedMode = modeForIntegrationKind(context.integrationKind);
  if (context.mode !== expectedMode) {
    throw new OnchainPolicyError(
      `mode ${context.mode} is not valid for integrationKind ${context.integrationKind} (expected ${expectedMode})`,
    );
  }
  if (context.integrationKind === "local_testnet_replica") {
    if (context.chainId !== TESTNET_CHAIN_ID) {
      throw new OnchainPolicyError(
        `local_testnet_replica requires isolated chain ${TESTNET_CHAIN_ID} (got ${context.chainId})`,
      );
    }
  } else if (context.integrationKind === "verified_provider_testnet") {
    const evidence: ProviderEvidence = getProviderEvidence(context.providerId);
    if (evidence.testnetEvidence.status !== "verified") {
      throw new OnchainPolicyError(
        `Provider ${context.providerId} has no verified testnet evidence; actual adapters stay disabled`,
      );
    }
    if (context.chainId !== evidence.testnetEvidence.chainId) {
      throw new OnchainPolicyError(
        `verified_provider_testnet requires chain ${evidence.testnetEvidence.chainId} (got ${context.chainId})`,
      );
    }
  } else {
    throw new OnchainPolicyError(`Unknown integrationKind ${JSON.stringify(context.integrationKind)}`);
  }
  if (!context.deploymentId || !context.networkId || !context.providerVersion || !context.custodyProfileId) {
    throw new OnchainPolicyError("BetaContext requires network, deployment, provider version and custody profile");
  }
}

export function assertProviderKnown(providerId: StockProviderId): void {
  getProviderEvidence(providerId);
}
