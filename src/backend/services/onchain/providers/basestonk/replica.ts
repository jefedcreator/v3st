import { type Address, type Hex, encodeFunctionData } from "viem";

import { hookFeeAbi } from "@/backend/services/onchain/abis";
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
  distributionCapabilities,
  DistributionReplicaError,
  loadSourceStrategy,
  type SourceProvenance,
} from "../distributions";
import { BASESTONK_SCHEMA_VERSION, parseBaseStonkFee } from "./schemas";

export class BaseStonkReplicaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaseStonkReplicaError";
  }
}

export const basestonkCapabilities: ProviderCapabilities = distributionCapabilities("basestonk");

type BaseStonkProvenance = SourceProvenance & { hook: string };

function provenanceOf(prov: SourceProvenance): BaseStonkProvenance {
  const p = prov as BaseStonkProvenance;
  if (typeof p.hook !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(p.hook)) {
    throw new BaseStonkReplicaError("BaseStonk strategy has no hook contract provenance");
  }
  return p;
}

async function readLaunch(hook: Address, launchId: Hex): Promise<{ hookVersion: Hex; feeBps: bigint; feeRecipient: Address; pendingFees: bigint; exists: boolean }> {
  const value: unknown = await publicClientFor().readContract({
    address: hook,
    abi: hookFeeAbi,
    functionName: "launches",
    args: [launchId],
  });
  const tuple = value as [Hex, bigint, Address, bigint, boolean];
  return { hookVersion: tuple[0], feeBps: tuple[1], feeRecipient: tuple[2], pendingFees: tuple[3], exists: tuple[4] };
}

async function readKnown(hook: Address, version: Hex): Promise<boolean> {
  const value: unknown = await publicClientFor().readContract({
    address: hook,
    abi: hookFeeAbi,
    functionName: "knownHookVersions",
    args: [version],
  });
  return value as boolean;
}

async function readFeeToken(hook: Address, launchId: Hex): Promise<Address> {
  const value: unknown = await publicClientFor().readContract({
    address: hook,
    abi: hookFeeAbi,
    functionName: "feeTokenOf",
    args: [launchId],
  });
  return value as Address;
}

// Unknown hook versions/entitlements are unavailable: both the launch and its hook
// version must be registered onchain.
async function assertKnownHook(
  hook: Address,
  launchId: Hex,
): Promise<{ hookVersion: Hex; feeBps: bigint; pendingFees: bigint }> {
  const launch = await readLaunch(hook, launchId);
  if (!launch.exists) throw new BaseStonkReplicaError("unknown hook entitlement: launch not registered");
  const known = await readKnown(hook, launch.hookVersion);
  if (!known) throw new BaseStonkReplicaError("unknown hook version: unavailable");
  return launch;
}

class BaseStonkHookAdapter implements StrategyAdapter {
  readonly capabilities = basestonkCapabilities;

  async quote(input: StrategyRequest): Promise<StrategyQuote> {
    if (input.context.chainId !== 31337 || input.context.providerId !== "basestonk") {
      throw new DistributionReplicaError("basestonk replica only serves the local testnet");
    }
    if (input.action !== "claim") {
      throw new DistributionReplicaError("basestonk replica supports fee claims only; no holder income is assumed");
    }
    const { strategy, prov } = await loadSourceStrategy(input.strategyId, "basestonk");
    const p = provenanceOf(prov);
    const hook = p.hook as Address;
    const launchId = p.launchId as Hex;
    const launch = await assertKnownHook(hook, launchId);
    const feeToken = await readFeeToken(hook, launchId);
    const feeAsset = assetKey("testnet", input.context.chainId, feeToken.toLowerCase());
    const parsed = parseBaseStonkFee({
      schemaVersion: BASESTONK_SCHEMA_VERSION,
      launchId,
      hookVersion: launch.hookVersion,
      feeBps: Number(launch.feeBps),
      feeAsset,
      pendingFees: launch.pendingFees.toString(),
    });
    // Fees are paid to the launch's fee recipient, not to the claiming account, so the
    // plan's minimum output for the account is zero.
    return buildClaimQuote(input, "basestonk", {
      target: hook,
      callData: encodeFunctionData({ abi: hookFeeAbi, functionName: "claimFees", args: [launchId] }),
      minimumOutput: { asset: parsed.feeAsset, raw: 0n },
      strategyVersion: strategy.version,
      disclosureVersion: strategy.disclosureVersion,
    });
  }

  async prepare(quote: StrategyQuote, operationId: string) {
    const { prov } = await loadSourceStrategy(quote.request.strategyId, "basestonk");
    const p = provenanceOf(prov);
    const hook = p.hook as Address;
    const launchId = p.launchId as Hex;
    await assertKnownHook(hook, launchId);
    const minimumOutput = quote.minimumOutputs[0];
    if (!minimumOutput) throw new DistributionReplicaError("Claim quote has no minimum output");
    return buildClaimPlan(quote, operationId, "basestonk", {
      target: hook,
      callData: encodeFunctionData({ abi: hookFeeAbi, functionName: "claimFees", args: [launchId] }),
      minimumOutput,
    });
  }
}

export const basestonkStrategyReplica: StrategyAdapter = new BaseStonkHookAdapter();
