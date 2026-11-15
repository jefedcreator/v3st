import { decodeAbiParameters, parseEventLogs, type Address, type Hex } from "viem";

import { policy } from "@/backend/config/policy";
import { settlementTokenAbi, stockTokenAbi } from "@/backend/services/onchain/abis";
import type { AssetAmount, AssetDelta, ExecutionObservation } from "@/backend/services/onchain/types";
import { parseAssetKey } from "@/backend/services/onchain/types";
import {
  publicClientFor,
  rpcRequest,
  testnetRpcUrl,
  type TestnetError,
  type TestnetManifest,
} from "@/backend/services/onchain/testnet";

export class ReceiptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptValidationError";
  }
}

const tokenReadAbi = [...settlementTokenAbi, ...stockTokenAbi] as never;

export async function readTokenBalance(asset: string, account: Address): Promise<bigint> {
  const { address } = parseAssetKey(asset);
  const client = publicClientFor();
  const balance = await client.readContract({
    address: address as Address,
    abi: tokenReadAbi,
    functionName: "balanceOf",
    args: [account],
  });
  return balance;
}

export async function captureBalances(
  assets: string[],
  account: Address,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const asset of assets) {
    out[asset] = (await readTokenBalance(asset, account)).toString();
  }
  return out;
}

export type ReceiptView = {
  status: "success" | "reverted";
  blockNumber: bigint;
  blockHash: Hex;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  transactionHash: Hex;
};

export async function fetchReceipt(txHash: Hex): Promise<ReceiptView | null> {
  const client = publicClientFor();
  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash });
    return {
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.effectiveGasPrice,
      transactionHash: receipt.transactionHash,
    };
  } catch {
    return null;
  }
}

// Only transfers emitted by the execution transaction count toward its fill.
// Donations, later swaps and block-wide balances cannot alter these deltas.
export async function transactionDeltas(txHash: Hex, assets: string[], account: Address): Promise<AssetDelta[]> {
  const receipt = await publicClientFor().getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") return [];
  const normalized = account.toLowerCase();
  return [...new Set(assets)].map((asset) => {
    const token = parseAssetKey(asset).address.toLowerCase();
    const logs = parseEventLogs({ abi: settlementTokenAbi, eventName: "Transfer", logs: receipt.logs.filter((l) => l.address.toLowerCase() === token) });
    let signedRaw = 0n;
    for (const log of logs) {
      if (log.args.to.toLowerCase() === normalized) signedRaw += log.args.value;
      if (log.args.from.toLowerCase() === normalized) signedRaw -= log.args.value;
    }
    return { account, asset, signedRaw };
  });
}

export async function txExists(txHash: Hex): Promise<boolean> {
  const url = testnetRpcUrl();
  const tx = await rpcRequest<{ hash: Hex } | null>(url, "eth_getTransactionByHash", [txHash]);
  return tx !== null;
}

// Replays a reverted transaction with eth_call at its inclusion block (a reverted
// tx leaves state untouched, so the replay reverts identically) and decodes the
// Error(string) reason when the fixture produced one.
export async function revertReasonOf(txHash: Hex): Promise<string | null> {
  const url = testnetRpcUrl();
  const tx = await rpcRequest<{
    from: Hex;
    to: Hex | null;
    input: Hex;
    value: Hex;
    gas: Hex;
    blockNumber: Hex | null;
  } | null>(url, "eth_getTransactionByHash", [txHash]);
  if (!tx?.to || !tx?.blockNumber) return null;
  try {
    // Replay against the state before the inclusion block: at the post-state the
    // account nonce has already moved, so the replay would revert for the wrong
    // reason. A reverted tx leaves no state changes, so the pre-state reproduces
    // the original revert data.
    const preBlock = `0x${(BigInt(tx.blockNumber) - 1n).toString(16)}`;
    await rpcRequest<Hex>(url, "eth_call", [
      { from: tx.from, to: tx.to, data: tx.input, value: tx.value, gas: tx.gas },
      preBlock,
    ]);
    return null;
  } catch (error) {
    const data = (error as TestnetError).data;
    const hex = typeof data === "string" ? data : ((data as { data?: string } | undefined)?.data ?? null);
    if (hex?.startsWith("0x08c379a0")) {
      try {
        return decodeAbiParameters([{ type: "string" }], `0x${hex.slice(10)}`)[0];
      } catch {
        return null;
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    const match = /execution reverted: (.+)$/.exec(message);
    return match ? match[1]!.trim() : null;
  }
}

export async function isReorged(receipt: ReceiptView): Promise<boolean> {
  const url = testnetRpcUrl();
  const block = await rpcRequest<{ hash: Hex; number: Hex } | null>(url, "eth_getBlockByNumber", [
    `0x${receipt.blockNumber.toString(16)}`,
    false,
  ]);
  if (!block) return true;
  return block.hash.toLowerCase() !== receipt.blockHash.toLowerCase();
}

export async function observationState(
  txHash: Hex | null,
  requiredConfirmations: number,
): Promise<ExecutionObservation["state"]> {
  if (!txHash) return "pending";
  const receipt = await fetchReceipt(txHash);
  if (!receipt) {
    return (await txExists(txHash)) ? "pending" : "unknown";
  }
  if (await isReorged(receipt)) return "reorged";
  const latest = await publicClientFor().getBlockNumber();
  if (receipt.blockNumber + BigInt(requiredConfirmations) <= latest) return receipt.status === "reverted" ? "reverted" : "confirmed";
  return "pending";
}

// Signed, transaction-local balance differences attributed to one account.
// signedRaw is a bounded difference of validated uint256 balances: positive means
// received, negative means spent; parseRaw must never parse it.
export function deltaVector(
  pre: Record<string, string>,
  post: Record<string, string>,
  account: Address,
): AssetDelta[] {
  const assets = new Set([...Object.keys(pre), ...Object.keys(post)]);
  const out: AssetDelta[] = [];
  for (const asset of assets) {
    const before = BigInt(pre[asset] ?? "0");
    const after = BigInt(post[asset] ?? "0");
    out.push({ account, asset, signedRaw: after - before });
  }
  return out;
}

export function spentOf(deltas: AssetDelta[], asset: string): bigint {
  const d = deltas.find((x) => x.asset === asset);
  return d && d.signedRaw < 0n ? -d.signedRaw : 0n;
}

export function receivedOf(deltas: AssetDelta[], asset: string): bigint {
  const d = deltas.find((x) => x.asset === asset);
  return d && d.signedRaw > 0n ? d.signedRaw : 0n;
}

export function buildObservation(input: {
  operationId: string;
  txHash: Hex | null;
  state: ExecutionObservation["state"];
  receipt: ReceiptView | null;
  deltas: AssetDelta[];
  inputAsset: string;
  outputAsset: string;
}): ExecutionObservation {
  return {
    operationId: input.operationId,
    state: input.state,
    txHash: input.txHash,
    blockHash: input.receipt?.blockHash ?? null,
    blockNumber: input.receipt?.blockNumber ?? null,
    actualInput: { asset: input.inputAsset, raw: spentOf(input.deltas, input.inputAsset) },
    actualOutput: { asset: input.outputAsset, raw: receivedOf(input.deltas, input.outputAsset) },
    deltas: input.deltas,
    gasCostWei: input.receipt ? input.receipt.gasUsed * input.receipt.effectiveGasPrice : null,
  };
}

export class PartialFillViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartialFillViolation";
  }
}

// Partial-fill rules from the accepted quote. quotedInput 10,000,000 with minimum
// output 100 raw units: a 4,000,000 input fill requires at least
// ceil(100 * 4,000,000 / 10,000,000) = 40 output units.
export function assertPartialFill(
  quote: { input: AssetAmount; minOutput: AssetAmount; allowPartialFill: boolean },
  actualInput: bigint,
  actualOutput: bigint,
): void {
  const quotedInput = quote.input.raw;
  if (actualInput <= 0n || actualInput > quotedInput) {
    throw new PartialFillViolation(`actualInput ${actualInput} outside (0, ${quotedInput}]`);
  }
  if (actualInput < quotedInput && !quote.allowPartialFill) {
    throw new PartialFillViolation("Partial fill is not accepted by this quote");
  }
  if (actualInput < quotedInput) {
    // Conservative integer rounding up: the minimum output/input rate is preserved.
    const required = (quote.minOutput.raw * actualInput + quotedInput - 1n) / quotedInput;
    if (actualOutput < required) {
      throw new PartialFillViolation(
        `actualOutput ${actualOutput} below pro-rata minimum ${required}`,
      );
    }
  } else if (actualOutput < quote.minOutput.raw) {
    throw new PartialFillViolation(`actualOutput ${actualOutput} below minimum ${quote.minOutput.raw}`);
  }
}

export function assertMinimumOutput(
  expected: AssetAmount,
  actual: AssetAmount | null,
  minimum: AssetAmount,
): void {
  void expected;
  if (!actual) throw new ReceiptValidationError("No output was received");
  if (actual.asset !== minimum.asset) {
    throw new ReceiptValidationError("Output asset mismatch");
  }
  if (actual.raw < minimum.raw) {
    throw new ReceiptValidationError(
      `Received ${actual.raw} below minimum ${minimum.raw}`,
    );
  }
}

export function requiredConfirmations(manifest: TestnetManifest): number {
  void manifest;
  return policy.onchain.requiredConfirmations;
}
