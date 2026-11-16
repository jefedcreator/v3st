import { hydrexPositionManagerABI, hydrexSwapRouterABI } from "@hydrexfi/hydrex-sdk";
import { decodeFunctionData, zeroAddress, type Address } from "viem";

import type { NetworkManifest } from "@/backend/services/onchain/manifests";
import { readPoolOn, fullRangeTicks } from "@/backend/services/onchain/providers/hydrex/pool";
import type { ExecutionPlan, PreparedCall, StrategyPlan } from "@/backend/services/onchain/types";
import { parseAssetKey } from "@/backend/services/onchain/types";
import { db } from "@/server/db";

import { ExecutionPlanRejected } from "./policy";

// Call-level rules for Hydrex contracts. Returns false when the target is not a
// Hydrex contract (the caller falls through to the replica rules), true when the
// call validated, and throws ExecutionPlanRejected on any mismatch with the
// accepted quote/plan — even though the target contract itself is approved.
export async function assertHydrexCall(
  call: PreparedCall,
  plan: ExecutionPlan | StrategyPlan,
  external: NetworkManifest["external"],
  ownedTokenId: bigint | null,
): Promise<boolean> {
  const names = new Map<string, string>();
  for (const [name, entry] of Object.entries(external)) names.set(entry.address.toLowerCase(), name);
  const targetName = names.get(call.to.toLowerCase());
  if (targetName !== "HydrexSwapRouter" && targetName !== "HydrexPositionManager") return false;
  if (call.value !== 0n) {
    throw new ExecutionPlanRejected("Native value transfers on Hydrex contracts are not allowed");
  }
  const deadlineSeconds = BigInt(Math.floor(plan.deadline.getTime() / 1000));
  if (targetName === "HydrexSwapRouter") {
    let decoded: { functionName: string; args?: readonly unknown[] };
    try {
      decoded = decodeFunctionData({ abi: hydrexSwapRouterABI, data: call.data });
    } catch {
      throw new ExecutionPlanRejected("Unknown calldata selector on the Hydrex swap router");
    }
    if (decoded.functionName !== "exactInputSingle") {
      throw new ExecutionPlanRejected(`Router function ${decoded.functionName} is not allowed on the Hydrex swap router`);
    }
    if (!("expectedInput" in plan)) {
      throw new ExecutionPlanRejected("A router swap is not valid in a strategy plan");
    }
    const params = decoded.args![0] as {
      tokenIn: Address;
      tokenOut: Address;
      deployer: Address;
      recipient: Address;
      deadline: bigint;
      amountIn: bigint;
      amountOutMinimum: bigint;
      limitSqrtPrice: bigint;
    };
    const inputAsset = parseAssetKey(plan.expectedInput.asset);
    const outputAsset = parseAssetKey(plan.minimumOutput.asset);
    if (
      params.tokenIn.toLowerCase() !== inputAsset.address.toLowerCase() ||
      params.tokenOut.toLowerCase() !== outputAsset.address.toLowerCase()
    ) {
      throw new ExecutionPlanRejected("Swap token pair differs from the accepted quote");
    }
    if (params.amountIn !== plan.expectedInput.raw) {
      throw new ExecutionPlanRejected("Swap amountIn differs from the accepted quote");
    }
    if (params.amountOutMinimum !== plan.minimumOutput.raw) {
      throw new ExecutionPlanRejected("Swap amountOutMinimum differs from the accepted quote");
    }
    if (params.recipient.toLowerCase() !== plan.recipient.toLowerCase()) {
      throw new ExecutionPlanRejected("Swap recipient differs from the plan recipient");
    }
    if (params.deployer !== zeroAddress) {
      throw new ExecutionPlanRejected("Swap deployer must be the zero address");
    }
    if (params.limitSqrtPrice !== 0n) {
      throw new ExecutionPlanRejected("Swap limitSqrtPrice must be zero (no price limit)");
    }
    if (params.deadline !== deadlineSeconds) {
      throw new ExecutionPlanRejected("Swap deadline differs from the plan deadline");
    }
    return true;
  }
  let decoded: { functionName: string; args?: readonly unknown[] };
  try {
    decoded = decodeFunctionData({ abi: hydrexPositionManagerABI, data: call.data });
  } catch {
    throw new ExecutionPlanRejected("Unknown calldata selector on the Hydrex position manager");
  }
  const fn = decoded.functionName;
  if (fn !== "mint" && fn !== "collect" && fn !== "decreaseLiquidity") {
    throw new ExecutionPlanRejected(`Position manager function ${fn} is not allowed`);
  }
  const params = decoded.args![0] as Record<string, unknown>;
  const pool = await poolOfPlan(plan);
  const state = await readPoolOn(plan.context.chainId, pool);
  if (fn === "mint") {
    if ("expectedInput" in plan) {
      throw new ExecutionPlanRejected("mint is not valid in a spot plan");
    }
    const { tickLower, tickUpper } = fullRangeTicks(state.tickSpacing);
    if (params.tickLower !== tickLower || params.tickUpper !== tickUpper) {
      throw new ExecutionPlanRejected("Mint ticks are not the pool's full range");
    }
    if (
      String(params.token0).toLowerCase() !== state.token0.toLowerCase() ||
      String(params.token1).toLowerCase() !== state.token1.toLowerCase()
    ) {
      throw new ExecutionPlanRejected("Mint token pair differs from the pool");
    }
    const inputAssets = plan.maximumInputs.map((a) => parseAssetKey(a.asset).address.toLowerCase());
    if (!inputAssets.includes(String(params.token0).toLowerCase()) || !inputAssets.includes(String(params.token1).toLowerCase())) {
      throw new ExecutionPlanRejected("Mint token pair differs from the plan's input assets");
    }
    const capOf = (address: string): bigint =>
      plan.maximumInputs.find((a) => parseAssetKey(a.asset).address.toLowerCase() === address)?.raw ?? 0n;
    if (
      (params.amount0Desired as bigint) > capOf(String(params.token0).toLowerCase()) ||
      (params.amount1Desired as bigint) > capOf(String(params.token1).toLowerCase())
    ) {
      throw new ExecutionPlanRejected("Mint desired amounts exceed the accepted inputs");
    }
    if (String(params.recipient).toLowerCase() !== plan.recipient.toLowerCase()) {
      throw new ExecutionPlanRejected("Mint recipient differs from the plan recipient");
    }
    const deployer = external.HydrexPoolDeployer?.address;
    if (String(params.deployer).toLowerCase() !== deployer?.toLowerCase()) {
      throw new ExecutionPlanRejected("Mint deployer differs from the manifest pool deployer");
    }
    if (params.deadline !== deadlineSeconds) {
      throw new ExecutionPlanRejected("Mint deadline differs from the plan deadline");
    }
    return true;
  }
  if (ownedTokenId === null || params.tokenId !== ownedTokenId) {
    throw new ExecutionPlanRejected("Call token id differs from the position this operation owns");
  }
  if (fn === "collect") {
    if (String(params.recipient).toLowerCase() !== plan.recipient.toLowerCase()) {
      throw new ExecutionPlanRejected("Collect recipient differs from the plan recipient");
    }
    return true;
  }
  const minimumOf = (address: string): bigint | undefined =>
    ("minimumOutputs" in plan ? plan.minimumOutputs : []).find(
      (a) => parseAssetKey(a.asset).address.toLowerCase() === address,
    )?.raw;
  if (
    params.amount0Min !== minimumOf(state.token0.toLowerCase()) ||
    params.amount1Min !== minimumOf(state.token1.toLowerCase())
  ) {
    throw new ExecutionPlanRejected("DecreaseLiquidity minimums differ from the accepted quote");
  }
  return true;
}

async function poolOfPlan(plan: ExecutionPlan | StrategyPlan): Promise<Address> {
  if (!("expectedInput" in plan)) {
    const op = await db.onchainOperation.findUnique({ where: { id: plan.operationId } });
    const quote = op?.expected as { quote?: { request?: { strategyId?: string } } } | null;
    const strategyId = quote?.quote?.request?.strategyId;
    if (strategyId) {
      const strategy = await db.strategy.findUnique({ where: { id: strategyId } });
      const prov = strategy?.provenance as { kind?: string; pool?: string; positionManager?: string } | null;
      if (prov?.kind === "hydrex_nft" && typeof prov.pool === "string") return prov.pool as Address;
    }
  }
  const { manifestFor } = await import("@/backend/services/onchain/manifests");
  const entry = manifestFor(plan.context.chainId).external.HydrexPoolAAPL;
  if (!entry) throw new ExecutionPlanRejected("No Hydrex pool in the network manifest");
  return entry.address;
}
