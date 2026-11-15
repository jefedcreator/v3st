import { decodeFunctionData, type Address, type Hex, keccak256, toBytes } from "viem";

import { now } from "@/backend/clock";
import { assertOnchainContext } from "@/backend/integrations/onchain-policy";
import { settlementTokenAbi, stockTokenAbi } from "@/backend/services/onchain/abis";
import type { AssetAmount, ExecutionPlan, PreparedCall, StrategyPlan } from "@/backend/services/onchain/types";
import { parseAssetKey } from "@/backend/services/onchain/types";
import { chainNowMs, readManifest } from "@/backend/services/onchain/testnet";
import { db } from "@/server/db";
import { canonicalJson, sha256Hex } from "@/utils";

export class ExecutionPlanRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionPlanRejected";
  }
}

const MAX_UINT256 = 2n ** 256n - 1n;

export function planFingerprint(plan: ExecutionPlan | StrategyPlan): string {
  return sha256Hex(
    canonicalJson({
      operationId: plan.operationId,
      calls: plan.calls.map((c) => [c.to, c.data, c.value.toString()]),
      recipient: plan.recipient,
      deadline: plan.deadline.toISOString(),
    }),
  );
}

// Approved call targets: manifest contracts, plan asset addresses, and pool
// addresses recorded in stock/strategy provenance (pools are deployed per test).
async function allowedTargets(plan: ExecutionPlan | StrategyPlan): Promise<Set<string>> {
  const manifest = readManifest();
  const targets = new Set<string>();
  for (const entry of Object.values(manifest.contracts)) {
    targets.add(entry.address.toLowerCase());
  }
  const assets: string[] = [];
  if ("expectedInput" in plan) {
    assets.push(plan.expectedInput.asset, plan.minimumOutput.asset);
  } else {
    for (const a of [...plan.maximumInputs, ...plan.minimumOutputs]) assets.push(a.asset);
  }
  for (const asset of assets) {
    try {
      targets.add(parseAssetKey(asset).address.toLowerCase());
    } catch {
      throw new ExecutionPlanRejected(`Plan references a malformed asset key ${asset}`);
    }
  }
  const provenanced = await Promise.all([
    db.stock.findMany({ select: { provenance: true } }),
    db.strategy.findMany({ select: { provenance: true } }),
  ]);
  for (const row of provenanced.flat()) {
    const pool = (row.provenance as { hydrexPool?: unknown; pool?: unknown } | null)?.hydrexPool ??
      (row.provenance as { pool?: unknown } | null)?.pool;
    if (typeof pool === "string" && /^0x[0-9a-fA-F]{40}$/.test(pool)) {
      targets.add(pool.toLowerCase());
    }
  }
  return targets;
}

function assertCall(
  call: PreparedCall,
  plan: ExecutionPlan | StrategyPlan,
  targets: Set<string>,
): void {
  if (call.value !== 0n) {
    throw new ExecutionPlanRejected("Native value transfers are not allowed in beta execution plans");
  }
  if (!targets.has(call.to.toLowerCase())) {
    throw new ExecutionPlanRejected(`Call target ${call.to} is not an approved contract or asset`);
  }
  let decoded: { functionName: string; args?: readonly unknown[] } | null = null;
  const abis = [settlementTokenAbi, stockTokenAbi] as const;
  for (const abi of abis) {
    try {
      decoded = decodeFunctionData({ abi, data: call.data });
      break;
    } catch {
      continue;
    }
  }
  if (!decoded) {
    // Provider replica contracts are decoded by their own ABIs in the provider modules;
    // here we only require that the selector is not a token function we do not allow.
    const selector = call.data.slice(0, 10).toLowerCase();
    const tokenSelectors = new Set(
      [settlementTokenAbi, stockTokenAbi].flatMap((abi) =>
        (abi as readonly { type: string; name?: string; inputs?: readonly unknown[] }[])
          .filter((item) => item.type === "function")
          .map((item) => {
            const sig = `${item.name}(${(item.inputs ?? []).map((i) => (i as { type: string }).type).join(",")})`;
            return keccak256(toBytes(sig)).slice(0, 10).toLowerCase();
          }),
      ),
    );
    if (tokenSelectors.has(selector)) {
      throw new ExecutionPlanRejected(`Token call ${selector} could not be decoded safely`);
    }
    return;
  }
  const fn = decoded.functionName;
  const args = (decoded.args ?? []) as unknown[];
  if (fn === "approve") {
    const spender = String(args[0]).toLowerCase();
    const amount = args[1] as bigint;
    if (!targets.has(spender)) {
      throw new ExecutionPlanRejected(`Approval spender ${spender} is not an approved contract`);
    }
    if (amount === MAX_UINT256) {
      throw new ExecutionPlanRejected("Unlimited approvals are rejected");
    }
    // The cap is per asset: the approval on token X may not exceed X's bounded input.
    const caps: AssetAmount[] = "expectedInput" in plan ? [plan.expectedInput] : plan.maximumInputs;
    const cap =
      caps.find((a) => {
        try {
          return parseAssetKey(a.asset).address.toLowerCase() === call.to.toLowerCase();
        } catch {
          return false;
        }
      })?.raw ?? 0n;
    if (amount > cap) {
      throw new ExecutionPlanRejected("Approval exceeds the bounded input cap");
    }
    return;
  }
  if (fn === "transfer" || fn === "transferFrom") {
    const to = String(args[fn === "transfer" ? 0 : 1]).toLowerCase();
    if (to !== plan.recipient.toLowerCase()) {
      throw new ExecutionPlanRejected(`Transfer recipient ${to} differs from the plan recipient`);
    }
    return;
  }
  throw new ExecutionPlanRejected(`Function ${fn} on an asset contract is not allowed in this plan`);
}

export async function assertExecutionPlan(plan: ExecutionPlan | StrategyPlan): Promise<void> {
  assertOnchainContext(plan.context);
  // The plan deadline is enforced onchain against block.timestamp, so the
  // passed-check uses the chain clock, not the (fakeable) app wall clock.
  if (plan.deadline.getTime() <= (await chainNowMs())) {
    throw new ExecutionPlanRejected("Plan deadline has passed");
  }
  if (plan.calls.length === 0 || plan.calls.length > 8) {
    throw new ExecutionPlanRejected("Plan must contain between 1 and 8 calls");
  }
  const targets = await allowedTargets(plan);
  for (const call of plan.calls) {
    assertCall(call, plan, targets);
  }
  const fingerprint = planFingerprint(plan);
  if (fingerprint !== plan.fingerprint) {
    throw new ExecutionPlanRejected("Plan fingerprint does not match its calls");
  }
}

export function callHashOf(call: PreparedCall): Hex {
  return keccak256(
    toBytes(
      canonicalJson([call.to.toLowerCase(), call.data, call.value.toString()]),
    ),
  );
}

export function operationKeyBytes32(operationId: string): Hex {
  return keccak256(toBytes(operationId));
}

export type { Address };
