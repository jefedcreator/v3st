import { type Address, type Hex, encodeFunctionData, keccak256, toHex, zeroAddress } from "viem";

import { db, withTx } from "@/server/db";
import type { ChainTransfer, Prisma } from "@/server/prisma";
import { assertBetaStage } from "@/backend/integrations/onchain-policy";
import { chainObject, chainTarget, publicClientOn, rpcOn, walletClientOn, relayerOn } from "@/backend/services/onchain/chains";
import { manifestFor, settlementAssetKeyOn, verifyManifest, type NetworkManifest } from "@/backend/services/onchain/manifests";
import { settlementTokenAbi } from "@/backend/services/onchain/abis";
import { allocateRelayerNonce, relayerLockKey } from "@/backend/services/execution/nonce";
import { transactionDeltas, txExists } from "@/backend/services/execution/receipts";
import { RetryableError } from "@/backend/services/jobs/types";
import { chainIdForLedgerChain } from "@/backend/services/app/network";
import { canonicalJson, sha256Hex } from "@/utils";
import { fromDbRaw } from "@/utils/asset-units";
import { ConflictException, ServiceUnavailableException } from "@/utils/exceptions";

const NON_MINEABLE_POLL_MS = 1_000;
const NON_MINEABLE_WAIT_MS = 120_000;

async function perform(
  t: Pick<ChainTransfer, "key" | "fromAddress" | "toAddress" | "amount">,
  chainId: number,
  mint = false,
): Promise<{ status: "confirmed" | "failed"; txHash: string }> {
  assertBetaStage();
  const manifest: NetworkManifest = manifestFor(chainId);
  const verified = await verifyManifest(chainId);
  if (!verified.ok) throw new ServiceUnavailableException("Managed transfer deployment unavailable", "NETWORK_UNHEALTHY");
  const client = publicClientOn(chainId);
  const settlement = manifest.contracts.TestSettlementToken!.address;
  const requestHash = sha256Hex(canonicalJson([manifest.deploymentId, t.fromAddress, t.toAddress, t.amount.toString()]));
  let payload = await db.localChainTransfer.findUnique({ where: { key: t.key } });
  if (payload && (payload.requestHash !== requestHash || payload.deploymentId !== manifest.deploymentId)) {
    throw new ConflictException("Transfer context changed; reconciliation required", "OPERATION_UNRESOLVED");
  }
  if (!payload) {
    const gasPrice = BigInt(await rpcOn<Hex>(chainId, "eth_gasPrice"));
    payload = await withTx(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${relayerLockKey(chainId)}::bigint)`);
      const existing = await tx.localChainTransfer.findUnique({ where: { key: t.key } });
      if (existing) return existing;
      const nonce = await allocateRelayerNonce(tx, chainId);
      const data = mint
        ? encodeFunctionData({ abi: settlementTokenAbi, functionName: "managedMint", args: [keccak256(toHex(t.key)), t.toAddress as Address, fromDbRaw(t.amount)] })
        : encodeFunctionData({ abi: settlementTokenAbi, functionName: "managedTransfer", args: [keccak256(toHex(t.key)), t.fromAddress as Address, t.toAddress as Address, fromDbRaw(t.amount)] });
      const signedTx = await walletClientOn(chainId).signTransaction({ account: relayerOn(chainId), chain: chainObject(chainId), to: settlement, data, nonce, gas: 200_000n, gasPrice });
      const input: Prisma.LocalChainTransferCreateInput = { key: t.key, deploymentId: manifest.deploymentId, requestHash, nonce, txHash: keccak256(signedTx), signedTx };
      return tx.localChainTransfer.create({ data: input });
    });
  }
  if (!(await txExists(payload.txHash as Hex, chainId))) {
    await client.sendRawTransaction({ serializedTransaction: payload.signedTx as Hex });
  }
  const receipt = await client.waitForTransactionReceipt({ hash: payload.txHash as Hex });
  // Confirm the receipt in canonical history. Local beta nodes need explicit block
  // advancement (anvil_mine, loopback only); public testnets are polled, and the
  // stored signed payload is reused on retry when the wait times out.
  const target = chainTarget(chainId);
  const required = receipt.blockNumber + BigInt(target.confirmations);
  if (target.canMine) {
    const head = await client.getBlockNumber();
    if (head < required) await rpcOn(chainId, "anvil_mine", [`0x${(required - head).toString(16)}`]);
  } else {
    const deadline = Date.now() + NON_MINEABLE_WAIT_MS;
    let head = await client.getBlockNumber();
    while (head < required && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, NON_MINEABLE_POLL_MS));
      head = await client.getBlockNumber();
    }
    if (head < required) throw new RetryableError("NETWORK_UNHEALTHY");
  }
  const canonical = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (canonical.hash !== receipt.blockHash) throw new ServiceUnavailableException("Transfer reorg requires reconciliation", "NETWORK_UNHEALTHY");
  const status: "confirmed" | "failed" = receipt.status === "success" ? "confirmed" : "failed";
  if (status === "confirmed") {
    const asset = chainId === 31337
      ? `testnet-${manifest.deploymentId}:${manifest.chainId}:${settlement.toLowerCase()}`
      : settlementAssetKeyOn(chainId);
    const deltas = await transactionDeltas(payload.txHash as Hex, [asset], t.toAddress as Address, chainId);
    if (deltas[0]?.signedRaw !== fromDbRaw(t.amount)) throw new ConflictException("Transfer receipt mismatch", "OPERATION_UNRESOLVED");
  }
  return { status, txHash: payload.txHash };
}

// Managed onchain transfer on a managed chain (31337 local replica, 84532 Base
// Sepolia), signed by that network's own relayer key.
export async function progressManagedTransfer(t: ChainTransfer): Promise<ChainTransfer> {
  const chainId = chainIdForLedgerChain(t.chain);
  const { status, txHash } = await perform(t, chainId);
  const data: Prisma.ChainTransferUpdateInput = { status, txHash, failureReason: status === "failed" ? "EXECUTION_REVERTED" : null };
  return db.chainTransfer.update({ where: { id: t.id }, data });
}

// Explicit fixture prefunding of a managed treasury. The journal identity is
// retained across restarts; a seed retry cannot issue additional test settlement
// tokens.
export async function seedManagedTreasury(chainId: number, key: string, toAddress: string, amount: Prisma.Decimal): Promise<void> {
  const result = await perform({ key: `seed:${key}`, fromAddress: zeroAddress, toAddress, amount }, chainId, true);
  if (result.status !== "confirmed") throw new ServiceUnavailableException("Managed treasury funding failed", "NETWORK_UNHEALTHY");
}
