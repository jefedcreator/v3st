import type { Address, Hex } from "viem";

import { policy } from "@/backend/config/policy";
import { settlementTokenAbi, stockTokenAbi } from "@/backend/services/onchain/abis";
import type { AssetAmount, ExecutionObservation } from "@/backend/services/onchain/types";
import { parseAssetKey } from "@/backend/services/onchain/types";
import { publicClientFor, rpcRequest, testnetRpcUrl, type TestnetManifest } from "@/backend/services/onchain/testnet";

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
  return balance as bigint;
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

export async function txExists(txHash: Hex): Promise<boolean> {
  const url = testnetRpcUrl();
  const tx = await rpcRequest<{ hash: Hex } | null>(url, "eth_getTransactionByHash", [txHash]);
  return tx !== null;
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
  if (receipt.status === "reverted") return "reverted";
  if (await isReorged(receipt)) return "reorged";
  const latest = await publicClientFor().getBlockNumber();
  if (receipt.blockNumber + BigInt(requiredConfirmations) <= latest) return "confirmed";
  return "pending";
}

export function deltaVector(
  pre: Record<string, string>,
  post: Record<string, string>,
  account: Address,
): { asset: string; spent: bigint; received: bigint }[] {
  void account;
  const assets = new Set([...Object.keys(pre), ...Object.keys(post)]);
  const out: { asset: string; spent: bigint; received: bigint }[] = [];
  for (const asset of assets) {
    const before = BigInt(pre[asset] ?? "0");
    const after = BigInt(post[asset] ?? "0");
    const delta = after - before;
    out.push({ asset, spent: delta < 0n ? -delta : 0n, received: delta > 0n ? delta : 0n });
  }
  return out;
}

export function buildObservation(input: {
  operationId: string;
  txHash: Hex | null;
  state: ExecutionObservation["state"];
  receipt: ReceiptView | null;
  deltas: { asset: string; spent: bigint; received: bigint }[];
  inputAsset: string;
  outputAsset: string;
}): ExecutionObservation {
  const inDelta = input.deltas.find((d) => d.asset === input.inputAsset);
  const outDelta = input.deltas.find((d) => d.asset === input.outputAsset);
  return {
    operationId: input.operationId,
    state: input.state,
    txHash: input.txHash,
    blockHash: input.receipt?.blockHash ?? null,
    blockNumber: input.receipt?.blockNumber ?? null,
    actualInput: inDelta ? { asset: input.inputAsset, raw: inDelta.spent } : null,
    actualOutput: outDelta ? { asset: input.outputAsset, raw: outDelta.received } : null,
    gasCostWei: input.receipt ? input.receipt.gasUsed * input.receipt.effectiveGasPrice : null,
  };
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
