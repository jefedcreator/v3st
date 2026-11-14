import type { Address } from "viem";

import { lockRows, type Tx } from "@/server/db";
import { publicClientFor } from "@/backend/services/onchain/testnet";

export async function allocateSignerNonce(
  tx: Tx,
  operationId: string,
  accountAddress: Address,
): Promise<number> {
  await lockRows(tx, "onchain_operations", [operationId]);
  const op = await tx.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
  if (op.nonce !== null) return op.nonce;
  const nonce = await publicClientFor().getTransactionCount({
    address: accountAddress,
    blockTag: "pending",
  });
  await tx.onchainOperation.update({ where: { id: operationId }, data: { nonce } });
  return nonce;
}

export async function accountOperationNonce(accountAddress: Address): Promise<bigint> {
  const { executionAccountAbi } = await import("@/backend/services/onchain/abis");
  const nonce = await publicClientFor().readContract({
    address: accountAddress,
    abi: executionAccountAbi,
    functionName: "nonce",
  });
  return (nonce as bigint) + 1n;
}

export async function currentBlockNumber(): Promise<bigint> {
  return publicClientFor().getBlockNumber();
}
