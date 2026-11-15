import type { Address } from "viem";

import { lockRows, type Tx } from "@/server/db";
import { publicClientFor, relayerAccount } from "@/backend/services/onchain/testnet";

// The shared relayer transaction nonce is allocated under its own advisory lock,
// separate from the per-operation row lock, so concurrent operations from two
// accounts sharing one relayer always receive distinct nonces. The allocated value
// is persisted on the operation row (relayerNonce) before broadcast.
const RELAYER_NONCE_LOCK = 72_011n;

export async function allocateRelayerNonce(tx: Tx): Promise<number> {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${RELAYER_NONCE_LOCK}::bigint)`);
  const nonce = await publicClientFor().getTransactionCount({
    address: relayerAccount().address,
    blockTag: "pending",
  });
  return nonce;
}

export async function allocateSignerNonce(
  tx: Tx,
  operationId: string,
  accountAddress: Address,
): Promise<number> {
  void accountAddress;
  await lockRows(tx, "onchain_operations", [operationId]);
  const op = await tx.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
  if (op.relayerNonce !== null) return op.relayerNonce;
  const nonce = await allocateRelayerNonce(tx);
  await tx.onchainOperation.update({ where: { id: operationId }, data: { relayerNonce: nonce } });
  return nonce;
}

export async function accountOperationNonce(accountAddress: Address): Promise<bigint> {
  const { executionAccountAbi } = await import("@/backend/services/onchain/abis");
  const nonce = await publicClientFor().readContract({
    address: accountAddress,
    abi: executionAccountAbi,
    functionName: "nonce",
  });
  return (nonce) + 1n;
}

export async function currentBlockNumber(): Promise<bigint> {
  return publicClientFor().getBlockNumber();
}
