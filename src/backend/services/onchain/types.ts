import type { Address, Hex } from "viem";

export type StockProviderId = "bankr" | "hydrex" | "stonks" | "basestonk" | "feel" | "o1";

export type AssetKey = string; // namespace:chainId:lowercase-address

export type IntegrationKind = "local_testnet_replica" | "verified_provider_testnet";

export type BetaContext = {
  stage: "beta";
  mode: "sandbox" | "simulated";
  integrationKind: IntegrationKind;
  networkId: string;
  chainId: number;
  deploymentId: string;
  providerId: StockProviderId;
  providerVersion: string;
  custodyProfileId: string;
};

export type AssetAmount = { asset: AssetKey; raw: bigint };

// Transaction-local balance difference attributed to one account and operation.
// Signed: positive means received, negative means spent. Bounded difference of
// validated uint256 balances, so parseRaw must never parse a signedRaw.
export type AssetDelta = { account: Address; asset: AssetKey; signedRaw: bigint };

export type EvidenceId = string;

export type ProviderCapabilities = {
  id: StockProviderId;
  kind: IntegrationKind;
  evidenceId: EvidenceId;
  custody: "application_account" | "provider_managed";
  spot: boolean;
  liquidity: boolean;
  distributions: boolean;
  separateClaim: boolean;
  exactOutput: boolean;
};

export type QuoteRequest = {
  userId: string;
  walletId: string;
  stockId: string;
  side: "buy" | "sell";
  input: AssetAmount;
  outputAsset: AssetKey;
  slippageBps: number;
  allowPartialFill?: boolean;
  context: BetaContext;
};

export type ExecutionQuote = {
  id: string;
  userId: string;
  walletId: string;
  stockId: string;
  side: "buy" | "sell";
  context: BetaContext;
  input: AssetAmount;
  expectedOutput: AssetAmount;
  minOutput: AssetAmount;
  userFeeUsdc: bigint;
  sponsorCostWei: bigint;
  allowPartialFill: boolean;
  priceImpactBps: number;
  expiresAt: Date;
  sourceBlock: bigint;
  routeFingerprint: string;
};

export type PreparedCall = { to: Address; data: Hex; value: bigint };

export type ExecutionPlan = {
  operationId: string;
  quoteId: string;
  walletId: string;
  context: BetaContext;
  calls: PreparedCall[];
  expectedInput: AssetAmount;
  minimumOutput: AssetAmount;
  recipient: Address;
  deadline: Date;
  fingerprint: string;
};

export type ExecutionObservation = {
  operationId: string;
  state: "pending" | "confirmed" | "reverted" | "unknown" | "reorged";
  txHash: Hex | null;
  blockHash: Hex | null;
  blockNumber: bigint | null;
  actualInput: AssetAmount | null;
  actualOutput: AssetAmount | null;
  deltas: AssetDelta[]; // transaction-local, attributed to this account and operation
  gasCostWei: bigint | null;
};

export interface SpotAdapter {
  readonly capabilities: ProviderCapabilities;
  quote(input: QuoteRequest): Promise<ExecutionQuote>;
  prepare(quote: ExecutionQuote, operationId: string): Promise<ExecutionPlan>;
}

export type StrategyAction = "enter" | "claim" | "exit";

export type StrategyRequest = {
  userId: string;
  strategyId: string;
  positionId: string | null;
  action: StrategyAction;
  inputs: AssetAmount[];
  context: BetaContext;
};

export type StrategyQuote = {
  id: string;
  request: StrategyRequest;
  minimumOutputs: AssetAmount[];
  maximumInputs: AssetAmount[];
  userFeeUsdc: bigint;
  expiresAt: Date;
  strategyVersion: string;
  disclosureVersion: string;
  planFingerprint: string;
};

export type StrategyPlan = {
  operationId: string;
  quoteId: string;
  walletId: string;
  context: BetaContext;
  calls: PreparedCall[];
  maximumInputs: AssetAmount[];
  minimumOutputs: AssetAmount[];
  recipient: Address;
  deadline: Date;
  fingerprint: string;
};

export interface StrategyAdapter {
  readonly capabilities: ProviderCapabilities;
  quote(input: StrategyRequest): Promise<StrategyQuote>;
  prepare(quote: StrategyQuote, operationId: string): Promise<StrategyPlan>;
}

export function assetKey(namespace: string, chainId: number | bigint, address: string): AssetKey {
  return `${namespace}:${chainId}:${address.toLowerCase()}`;
}

export function parseAssetKey(asset: AssetKey): { namespace: string; chainId: number; address: string } {
  const parts = asset.split(":");
  if (parts.length !== 3) {
    throw new Error(`Invalid asset key: ${asset}`);
  }
  const chainId = Number(parts[1]);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid chain id in asset key: ${asset}`);
  }
  return { namespace: parts[0]!, chainId, address: parts[2]! };
}
