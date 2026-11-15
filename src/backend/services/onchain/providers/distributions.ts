import { type Address, type Hex, encodeFunctionData } from "viem";

import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import type {
  BetaContext,
  PreparedCall,
  ProviderCapabilities,
  StockProviderId,
  StrategyPlan,
  StrategyQuote,
  StrategyRequest,
} from "@/backend/services/onchain/types";
import { planFingerprint } from "@/backend/services/execution/policy";
import { chainDeadlineBounded, chainDeadlineFromNow, onchainExpiryMs } from "@/backend/services/onchain/testnet";
import { db } from "@/server/db";
import { UnprocessableEntityException } from "@/utils/exceptions";

export class DistributionReplicaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DistributionReplicaError";
  }
}

// Distribution providers never declare general direct-stock spot execution without
// evidence: spot stays false, only distribution claims are supported.
export function distributionCapabilities(id: StockProviderId): ProviderCapabilities {
  return {
    id,
    kind: "local_testnet_replica",
    evidenceId: `evidence:${id}`,
    custody: "application_account",
    spot: false,
    liquidity: false,
    distributions: true,
    separateClaim: true,
    exactOutput: false,
  };
}

export type SourceProvenance = {
  source: string;
  launchId: string;
  [key: string]: unknown;
};

export async function loadSourceStrategy(strategyId: string, source: StockProviderId) {
  const strategy = await db.strategy.findUnique({ where: { id: strategyId } });
  if (!strategy) throw new UnprocessableEntityException("Unknown strategy", "STRATEGY_UNAVAILABLE");
  const prov = strategy.provenance as SourceProvenance | null;
  if (prov?.source !== source) {
    throw new DistributionReplicaError(`Strategy is not a ${source} distribution provenance`);
  }
  if (typeof prov.launchId !== "string" || !/^0x[0-9a-f]{64}$/.test(prov.launchId)) {
    throw new DistributionReplicaError(`Strategy has no valid launch id provenance`);
  }
  return { strategy, prov };
}

export function assertDistributionContext(context: BetaContext, source: StockProviderId): void {
  if (context.chainId !== 31337 || context.providerId !== source || context.integrationKind !== "local_testnet_replica") {
    throw new UnprocessableEntityException(`${source} replica only serves the local testnet`, "CAPABILITY_UNAVAILABLE");
  }
}

export async function executionAccountOf(userId: string): Promise<Address> {
  const wallet = await db.wallet.findFirst({ where: { userId, family: "evm" } });
  if (!wallet?.executionAddress) throw new DistributionReplicaError("Execution account missing");
  return wallet.executionAddress as Address;
}

export type ClaimPlanSpec = {
  target: Address;
  callData: Hex;
  minimumOutput: { asset: string; raw: bigint };
};

export async function buildClaimQuote(
  input: StrategyRequest,
  source: StockProviderId,
  spec: ClaimPlanSpec & { strategyVersion: string; disclosureVersion: string },
): Promise<StrategyQuote> {
  assertDistributionContext(input.context, source);
  if (input.action !== "claim") {
    throw new DistributionReplicaError(`${source} replica supports distribution claims only`);
  }
  return {
    id: `${source}-sq-${crypto.randomUUID()}`,
    request: input,
    minimumOutputs: [spec.minimumOutput],
    maximumInputs: [],
    userFeeUsdc: 0n,
    expiresAt: new Date(await onchainExpiryMs(policy.onchain.quoteTtlSeconds)),
    strategyVersion: spec.strategyVersion,
    disclosureVersion: spec.disclosureVersion,
    planFingerprint: "",
  };
}

export async function buildClaimPlan(
  quote: StrategyQuote,
  operationId: string,
  source: StockProviderId,
  spec: ClaimPlanSpec,
): Promise<StrategyPlan> {
  if (quote.expiresAt <= now()) throw new DistributionReplicaError("Quote expired before prepare");
  assertDistributionContext(quote.request.context, source);
  const wallet = await db.wallet.findFirstOrThrow({ where: { userId: quote.request.userId, family: "evm" } });
  const recipient = wallet.executionAddress as Address;
  if (!recipient) throw new DistributionReplicaError("Execution account missing");
  const calls: PreparedCall[] = [{ to: spec.target, data: spec.callData, value: 0n }];
  const plan: StrategyPlan = {
    operationId,
    quoteId: quote.id,
    walletId: wallet.id,
    context: quote.request.context,
    calls,
    maximumInputs: quote.maximumInputs,
    minimumOutputs: quote.minimumOutputs,
    recipient,
    deadline: await chainDeadlineBounded(quote.expiresAt.getTime()),
    fingerprint: "",
  };
  plan.fingerprint = planFingerprint(plan);
  return plan;
}

export function claimCallData(abi: Parameters<typeof encodeFunctionData>[0]["abi"], launchId: string): Hex {
  return encodeFunctionData({ abi, functionName: "claim", args: [launchId as Hex] });
}
