import type { Address } from "viem";

import { lockRows, type Tx } from "@/server/db";
import { chainTarget, publicClientOn, relayerOn } from "@/backend/services/onchain/chains";
import { manifestFor } from "@/backend/services/onchain/manifests";

// The shared relayer transaction nonce is allocated under its own advisory lock,
// separate from the per-operation row lock, so concurrent operations from two
// accounts sharing one relayer always receive distinct nonces. The lock and the
// prior-operation filter are scoped per network, so a Base Sepolia operation never
// reads a nonce allocated on the local node (or the reverse). The allocated value
// is persisted on the operation row (relayerNonce) before broadcast.
const RELAYER_NONCE_LOCK_BASE = 72_011n;

// The advisory lock every relayer nonce allocation (and every managed transfer)
// takes for a network, so concurrent operations on one relayer never share a nonce.
export function relayerLockKey(chainId: number): bigint {
  return RELAYER_NONCE_LOCK_BASE + BigInt(chainId);
}

export async function allocateRelayerNonce(tx: Tx, chainId: number): Promise<number> {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${relayerLockKey(chainId)}::bigint)`);
  const chainNonce = await publicClientOn(chainId).getTransactionCount({
    address: relayerOn(chainId).address,
    blockTag: "pending",
  });
  const deploymentId = manifestFor(chainId).deploymentId;
  const allocated = await tx.onchainOperation.findFirst({
    where: { relayerNonce: { not: null }, network: { deploymentId } },
    orderBy: { relayerNonce: "desc" },
    select: { relayerNonce: true },
  });
  const transfer = await tx.localChainTransfer.findFirst({ where: { deploymentId }, orderBy: { nonce: "desc" } });
  const nextTransfer = transfer ? transfer.nonce + 1 : 0;
  // Every logical operation owns two adjacent transactions, even before either
  // has reached the node's pending pool.
  return Math.max(chainNonce, nextTransfer, allocated?.relayerNonce === null || allocated?.relayerNonce === undefined ? 0 : allocated.relayerNonce + 2);
}

export async function allocateSignerNonce(
  tx: Tx,
  operationId: string,
  accountAddress: Address,
  chainId: number,
): Promise<number> {
  void accountAddress;
  await lockRows(tx, "onchain_operations", [operationId]);
  const op = await tx.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
  if (op.relayerNonce !== null) return op.relayerNonce;
  const nonce = await allocateRelayerNonce(tx, chainId);
  await tx.onchainOperation.update({ where: { id: operationId }, data: { relayerNonce: nonce } });
  return nonce;
}

export async function accountOperationNonce(accountAddress: Address, chainId: number): Promise<bigint> {
  const { executionAccountAbi } = await import("@/backend/services/onchain/abis");
  const nonce = await publicClientOn(chainId).readContract({
    address: accountAddress,
    abi: executionAccountAbi,
    functionName: "nonce",
  });
  return (nonce) + 1n;
}

export async function currentBlockNumber(chainId: number): Promise<bigint> {
  return publicClientOn(chainId).getBlockNumber();
}

export function canMine(chainId: number): boolean {
  return chainTarget(chainId).canMine;
}
