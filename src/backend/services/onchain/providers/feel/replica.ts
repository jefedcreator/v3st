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
import { FEEL_SCHEMA_VERSION, parseFeelClaim } from "./schemas";

export class FeelReplicaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeelReplicaError";
  }
}

export const feelCapabilities: ProviderCapabilities = distributionCapabilities("feel");

// Feel eligibility is tied to an eligible launch-token holding snapshot; ordinary
// ownership of the stock used in the pair does NOT qualify (entitlement stays 0).
type FeelProvenance = SourceProvenance & { distribution: string; launchToken: string };

function provenanceOf(prov: SourceProvenance): FeelProvenance {
  const p = prov as FeelProvenance;
  if (typeof p.distribution !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(p.distribution)) {
    throw new FeelReplicaError("Feel strategy has no distribution contract provenance");
  }
  if (typeof p.launchToken !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(p.launchToken)) {
    throw new FeelReplicaError("Feel strategy has no launch token provenance");
  }
  return p;
}

async function readEntitlement(distribution: Address, launchId: Hex, account: Address): Promise<bigint> {
  const value: unknown = await publicClientFor().readContract({
    address: distribution,
    abi: stockDistributionAbi,
    functionName: "entitlementOf",
    args: [launchId, account],
  });
  return value as bigint;
}

async function readRewardToken(distribution: Address, launchId: Hex): Promise<Address> {
  const value: unknown = await publicClientFor().readContract({
    address: distribution,
    abi: stockDistributionAbi,
    functionName: "rewardTokenOf",
    args: [launchId],
  });
  return value as Address;
}

class FeelDistributionAdapter implements StrategyAdapter {
  readonly capabilities = feelCapabilities;

  async quote(input: StrategyRequest): Promise<StrategyQuote> {
    if (input.context.chainId !== 31337 || input.context.providerId !== "feel") {
      throw new DistributionReplicaError("feel replica only serves the local testnet");
    }
    if (input.action !== "claim") {
      throw new DistributionReplicaError("feel replica supports distribution claims only");
    }
    const { strategy, prov } = await loadSourceStrategy(input.strategyId, "feel");
    const p = provenanceOf(prov);
    const distribution = p.distribution as Address;
    const launchId = p.launchId as Hex;
    const rewardToken = await readRewardToken(distribution, launchId);
    const rewardAsset = assetKey("testnet", input.context.chainId, rewardToken.toLowerCase());
    const account = await executionAccountOf(input.userId);
    // Entitlement comes from the launch-holding snapshot; prior-holder entitlements are
    // preserved even if balances change after the snapshot.
    const entitlement = await readEntitlement(distribution, launchId, account);
    const parsed = parseFeelClaim({
      schemaVersion: FEEL_SCHEMA_VERSION,
      epochKey: launchId,
      launchToken: p.launchToken,
      rewardAsset,
      entitlement: entitlement.toString(),
    });
    return buildClaimQuote(input, "feel", {
      target: distribution,
      callData: claimCallData(stockDistributionAbi, launchId),
      minimumOutput: { asset: parsed.rewardAsset, raw: parsed.entitlement },
      strategyVersion: strategy.version,
      disclosureVersion: strategy.disclosureVersion,
    });
  }

  async prepare(quote: StrategyQuote, operationId: string) {
    const { prov } = await loadSourceStrategy(quote.request.strategyId, "feel");
    const p = provenanceOf(prov);
    const distribution = p.distribution as Address;
    const launchId = p.launchId as Hex;
    const minimumOutput = quote.minimumOutputs[0];
    if (!minimumOutput) throw new DistributionReplicaError("Claim quote has no minimum output");
    return buildClaimPlan(quote, operationId, "feel", {
      target: distribution,
      callData: claimCallData(stockDistributionAbi, launchId),
      minimumOutput,
    });
  }
}

export const feelStrategyReplica: StrategyAdapter = new FeelDistributionAdapter();
