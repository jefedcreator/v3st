import { randomUUID } from "node:crypto";

import { type Address, type Hex } from "viem";

import { stockDistributionAbi } from "@/backend/services/onchain/abis";
import type {
  ProviderCapabilities,
  StrategyAdapter,
  StrategyQuote,
  StrategyRequest,
} from "@/backend/services/onchain/types";
import { assetKey } from "@/backend/services/onchain/types";
import { publicClientFor } from "@/backend/services/onchain/testnet";
import {
  buildClaimPlan,
  buildClaimQuote,
  claimCallData,
  distributionCapabilities,
  DistributionReplicaError,
  executionAccountOf,
  loadSourceStrategy,
  type SourceProvenance,
} from "../distributions";
import { parseStonksClaim, STONKS_SCHEMA_VERSION } from "./schemas";

export class StonksReplicaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StonksReplicaError";
  }
}

export const stonksCapabilities: ProviderCapabilities = distributionCapabilities("stonks");

type StonksProvenance = SourceProvenance & { distribution: string; generation: number };

function provenanceOf(prov: SourceProvenance): StonksProvenance {
  const p = prov as StonksProvenance;
  if (typeof p.distribution !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(p.distribution)) {
    throw new StonksReplicaError("Stonks strategy has no distribution contract provenance");
  }
  if (!Number.isInteger(p.generation) || p.generation < 1) {
    throw new StonksReplicaError("Stonks strategy has no router generation provenance");
  }
  return p;
}

async function readDistributionUint(
  distribution: Address,
  functionName: "generationOf" | "entitlementOf",
  args: readonly [Hex] | readonly [Hex, Address],
): Promise<bigint> {
  const value: unknown = await publicClientFor().readContract({
    address: distribution,
    abi: stockDistributionAbi,
    functionName,
    args,
  });
  return value as bigint;
}

async function readRewardToken(distribution: Address, launchId: string): Promise<Address> {
  const value: unknown = await publicClientFor().readContract({
    address: distribution,
    abi: stockDistributionAbi,
    functionName: "rewardTokenOf",
    args: [launchId as Hex],
  });
  return value as Address;
}

async function assertGenerationMatches(distribution: Address, launchId: string, expected: number): Promise<void> {
  const generation = Number(await readDistributionUint(distribution, "generationOf", [launchId as Hex]));
  if (generation !== expected) {
    throw new StonksReplicaError(
      "router generation mismatch: one generation's coin must not be sent to another generation's router/locker",
    );
  }
}

class StonksDistributionAdapter implements StrategyAdapter {
  readonly capabilities = stonksCapabilities;

  async quote(input: StrategyRequest): Promise<StrategyQuote> {
    if (input.context.chainId !== 31337 || input.context.providerId !== "stonks") {
      throw new DistributionReplicaError("stonks replica only serves the local testnet");
    }
    if (input.action !== "claim") {
      throw new DistributionReplicaError("stonks replica supports holder distribution claims only");
    }
    const { strategy, prov } = await loadSourceStrategy(input.strategyId, "stonks");
    const p = provenanceOf(prov);
    const distribution = p.distribution as Address;
    const launchId = p.launchId;
    await assertGenerationMatches(distribution, launchId, p.generation);
    const rewardToken = await readRewardToken(distribution, launchId);
    const rewardAsset = assetKey("testnet", input.context.chainId, rewardToken.toLowerCase());
    const account = await executionAccountOf(input.userId);
    const entitlement = await readDistributionUint(distribution, "entitlementOf", [launchId as Hex, account]);
    const parsed = parseStonksClaim({
      schemaVersion: STONKS_SCHEMA_VERSION,
      epochKey: launchId,
      generation: p.generation,
      rewardAsset,
      entitlement: entitlement.toString(),
    });
    void randomUUID;
    return buildClaimQuote(input, "stonks", {
      target: distribution,
      callData: claimCallData(stockDistributionAbi, launchId),
      minimumOutput: { asset: parsed.rewardAsset, raw: parsed.entitlement },
      strategyVersion: strategy.version,
      disclosureVersion: strategy.disclosureVersion,
    });
  }

  async prepare(quote: StrategyQuote, operationId: string) {
    const { prov } = await loadSourceStrategy(quote.request.strategyId, "stonks");
    const p = provenanceOf(prov);
    const distribution = p.distribution as Address;
    const launchId = p.launchId;
    await assertGenerationMatches(distribution, launchId, p.generation);
    const minimumOutput = quote.minimumOutputs[0];
    if (!minimumOutput) throw new DistributionReplicaError("Claim quote has no minimum output");
    return buildClaimPlan(quote, operationId, "stonks", {
      target: distribution,
      callData: claimCallData(stockDistributionAbi, launchId),
      minimumOutput,
    });
  }
}

export const stonksStrategyReplica: StrategyAdapter = new StonksDistributionAdapter();
