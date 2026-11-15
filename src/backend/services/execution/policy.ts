import { decodeFunctionData, type Address, type Hex, keccak256, toBytes } from "viem";

import { assertOnchainContext } from "@/backend/integrations/onchain-policy";
import { hydrexPoolAbi, o1RouterAbi, stockDistributionAbi, hookFeeAbi, hydropumpLockerAbi, settlementTokenAbi, stockTokenAbi } from "@/backend/services/onchain/abis";
import type { AssetAmount, ExecutionPlan, ExecutionQuote, PreparedCall, StrategyPlan, StrategyQuote } from "@/backend/services/onchain/types";
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
      quoteId: plan.quoteId,
      walletId: plan.walletId,
      context: plan.context,
      limits: "expectedInput" in plan ? [plan.expectedInput, plan.minimumOutput] : [plan.maximumInputs, plan.minimumOutputs],
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
    const marketAbis = [o1RouterAbi, hydrexPoolAbi, stockDistributionAbi, hookFeeAbi, hydropumpLockerAbi];
    for (const abi of marketAbis) {
      try {
        decoded = decodeFunctionData({ abi, data: call.data });
        break;
      } catch { /* try the next explicitly supported ABI */ }
    }
    if (!decoded) throw new ExecutionPlanRejected("Unknown calldata selector");
    const args = decoded.args ?? [];
    const fn = decoded.functionName;
    if (fn === "swapExactIn" && "expectedInput" in plan) {
      const [tokenIn, tokenOut, amountIn, minOut, recipient, deadline] = args;
      if (String(tokenIn).toLowerCase() !== parseAssetKey(plan.expectedInput.asset).address.toLowerCase() ||
          String(tokenOut).toLowerCase() !== parseAssetKey(plan.minimumOutput.asset).address.toLowerCase() ||
          amountIn !== plan.expectedInput.raw || minOut !== plan.minimumOutput.raw ||
          String(recipient).toLowerCase() !== plan.recipient.toLowerCase() ||
          deadline !== BigInt(Math.floor(plan.deadline.getTime() / 1000))) {
        throw new ExecutionPlanRejected("Swap arguments differ from accepted plan limits or recipient");
      }
      return;
    }
    if (!("maximumInputs" in plan)) throw new ExecutionPlanRejected("Unsupported spot call");
    if (fn === "deposit") {
      if (String(args[3]).toLowerCase() !== plan.recipient.toLowerCase() ||
          args[0] !== plan.maximumInputs[0]?.raw || args[1] !== plan.maximumInputs[1]?.raw) {
        throw new ExecutionPlanRejected("Deposit arguments differ from accepted inputs or recipient");
      }
      return;
    }
    if (fn === "withdraw" || fn === "withdrawAndClaim") {
      if (args.length !== 4 || args[0] !== plan.maximumInputs[0]?.raw ||
          args[1] !== plan.minimumOutputs[0]?.raw || args[2] !== plan.minimumOutputs[1]?.raw ||
          String(args[3]).toLowerCase() !== plan.recipient.toLowerCase()) {
        throw new ExecutionPlanRejected("Exit arguments differ from accepted limits or recipient");
      }
      return;
    }
    if (fn === "claimFees" || fn === "claim") {
      // Source identity is independently checked against strategy provenance below.
      if (args.length !== 1) throw new ExecutionPlanRejected("Invalid claim arguments");
      if (typeof args[0] === "string" && args[0].length === 42 && args[0].toLowerCase() !== plan.recipient.toLowerCase()) {
        throw new ExecutionPlanRejected("Claim recipient differs from accepted recipient");
      }
      return;
    }
    throw new ExecutionPlanRejected(`Unsupported market function ${fn}`);
  }
  const fn = decoded.functionName;
  const args = (decoded.args ?? []) as unknown[];
  if (fn === "approve") {
    const spender = String(args[0]).toLowerCase();
    const amount = args[1] as bigint;
    if (amount === MAX_UINT256) {
      throw new ExecutionPlanRejected("Unlimited approvals are rejected");
    }
    if (!targets.has(spender) || !plan.calls.some((c) => c.to.toLowerCase() === spender)) {
      throw new ExecutionPlanRejected(`Approval spender ${spender} is not the accepted execution target`);
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
    const caps: AssetAmount[] = "expectedInput" in plan ? [plan.expectedInput] : plan.maximumInputs;
    const cap = caps.find((a) => parseAssetKey(a.asset).address.toLowerCase() === call.to.toLowerCase())?.raw ?? 0n;
    const amount = args[fn === "transfer" ? 1 : 2] as bigint;
    if (fn === "transferFrom" || amount > cap) throw new ExecutionPlanRejected("Transfer exceeds approved input");
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
  const op = await db.onchainOperation.findUnique({ where: { id: plan.operationId } });
  if (op?.kind === "strategy") {
    const snapshot = op.expected as { quote: { request: { strategyId: string; action: string; inputs: { raw: { __bigint: string } }[] } } };
    const strategy = await db.strategy.findUniqueOrThrow({ where: { id: snapshot.quote.request.strategyId } });
    const source = strategy.provenance as { pool?: string; distribution?: string; hook?: string; locker?: string; launchId?: string; lockId?: string };
    const target = source.pool ?? source.distribution ?? source.hook ?? source.locker;
    for (const call of plan.calls) {
      if (call.data.startsWith("0x095ea7b3")) {
        const approved = decodeFunctionData({ abi: settlementTokenAbi, data: call.data });
        if (String(approved.args?.[0]).toLowerCase() !== target?.toLowerCase()) throw new ExecutionPlanRejected("Approval spender differs from strategy source");
      } else if (call.to.toLowerCase() !== target?.toLowerCase()) throw new ExecutionPlanRejected("Call differs from accepted strategy source");
      if (source.launchId && call.to.toLowerCase() === target?.toLowerCase()) {
        let decoded;
        try { decoded = decodeFunctionData({ abi: stockDistributionAbi, data: call.data }); }
        catch { decoded = decodeFunctionData({ abi: hookFeeAbi, data: call.data }); }
        if (String(decoded.args?.[0]).toLowerCase() !== source.launchId.toLowerCase()) throw new ExecutionPlanRejected("Claim source identity changed");
      }
    }
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

export function assertQuoteBinding(plan: ExecutionPlan | StrategyPlan, quote: ExecutionQuote | StrategyQuote,
  operation: { id: string; walletId: string; custodyProfileId: string; providerId: string }, recipient: string): void {
  const context = "context" in quote ? quote.context : quote.request.context;
  if (plan.operationId !== operation.id || plan.quoteId !== quote.id || plan.walletId !== operation.walletId ||
      context.custodyProfileId !== operation.custodyProfileId || context.providerId !== operation.providerId ||
      canonicalJson(plan.context) !== canonicalJson(context) || plan.recipient.toLowerCase() !== recipient.toLowerCase() ||
      plan.deadline > quote.expiresAt) throw new ExecutionPlanRejected("Plan identity differs from accepted quote");
  if ("input" in quote) {
    if (!("expectedInput" in plan) || canonicalJson(plan.expectedInput) !== canonicalJson(quote.input) ||
        canonicalJson(plan.minimumOutput) !== canonicalJson(quote.minOutput)) {
      throw new ExecutionPlanRejected("Plan limits differ from accepted quote");
    }
  } else if (!("maximumInputs" in plan) || canonicalJson(plan.maximumInputs) !== canonicalJson(quote.maximumInputs) ||
      canonicalJson(plan.minimumOutputs) !== canonicalJson(quote.minimumOutputs)) {
    throw new ExecutionPlanRejected("Strategy limits differ from accepted quote");
  }
}
