import { type Address, type Hex, encodeFunctionData, keccak256, toHex } from "viem";

import { db, withTx } from "@/server/db";
import type { ChainTransfer, Prisma } from "@/server/prisma";
import { policy } from "@/backend/config/policy";
import { assertBetaStage } from "@/backend/integrations/onchain-policy";
import { settlementTokenAbi } from "@/backend/services/onchain/abis";
import { publicClientFor, readManifest, relayerAccount, rpcRequest, testnetRpcUrl, testnetService, walletClientFor } from "@/backend/services/onchain/testnet";
import { allocateRelayerNonce } from "@/backend/services/execution/nonce";
import { transactionDeltas, txExists } from "@/backend/services/execution/receipts";
import { canonicalJson, sha256Hex } from "@/utils";
import { fromDbRaw } from "@/utils/asset-units";
import { ConflictException, ServiceUnavailableException } from "@/utils/exceptions";

async function perform(t: Pick<ChainTransfer, "key" | "fromAddress" | "toAddress" | "amount">, mint = false): Promise<{ status: "confirmed" | "failed"; txHash: string }> {
  assertBetaStage();
  const manifest = readManifest();
  const verified = await testnetService.verify(manifest);
  if (!verified.ok) throw new ServiceUnavailableException("Local transfer deployment unavailable", "NETWORK_UNHEALTHY");
  const client = publicClientFor();
  const settlement = manifest.contracts.TestSettlementToken!.address;
  const requestHash = sha256Hex(canonicalJson([manifest.deploymentId, t.fromAddress, t.toAddress, t.amount.toString()]));
  let payload = await db.localChainTransfer.findUnique({ where: { key: t.key } });
  if (payload && (payload.requestHash !== requestHash || payload.deploymentId !== manifest.deploymentId)) {
    throw new ConflictException("Transfer context changed; reconciliation required", "OPERATION_UNRESOLVED");
  }
  if (!payload) {
    const gasPrice = BigInt(await rpcRequest<Hex>(testnetRpcUrl(), "eth_gasPrice"));
    payload = await withTx(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(72011::bigint)`;
      const existing = await tx.localChainTransfer.findUnique({ where: { key: t.key } });
      if (existing) return existing;
      const nonce = await allocateRelayerNonce(tx);
      const data = mint
        ? encodeFunctionData({ abi: settlementTokenAbi, functionName: "managedMint", args: [keccak256(toHex(t.key)), t.toAddress as Address, fromDbRaw(t.amount)] })
        : encodeFunctionData({ abi: settlementTokenAbi, functionName: "managedTransfer", args: [keccak256(toHex(t.key)), t.fromAddress as Address, t.toAddress as Address, fromDbRaw(t.amount)] });
      const signedTx = await walletClientFor(relayerAccount()).signTransaction({ to: settlement, data, nonce, gas: 200_000n, gasPrice });
      const input: Prisma.LocalChainTransferCreateInput = { key: t.key, deploymentId: manifest.deploymentId, requestHash, nonce, txHash: keccak256(signedTx), signedTx };
      return tx.localChainTransfer.create({ data: input });
    });
  }
  if (!(await txExists(payload.txHash as Hex))) {
    await client.sendRawTransaction({ serializedTransaction: payload.signedTx as Hex });
  }
  const receipt = await client.waitForTransactionReceipt({ hash: payload.txHash as Hex });
  // Local beta nodes need explicit block advancement when no later transactions
  // arrive. This is permitted only after deployment verification on loopback Anvil.
  const head = await client.getBlockNumber();
  const required = receipt.blockNumber + BigInt(policy.onchain.requiredConfirmations);
  if (head < required) await rpcRequest(testnetRpcUrl(), "anvil_mine", [`0x${(required - head).toString(16)}`]);
  const canonical = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (canonical.hash !== receipt.blockHash) throw new ServiceUnavailableException("Transfer reorg requires reconciliation", "NETWORK_UNHEALTHY");
  const status: "confirmed" | "failed" = receipt.status === "success" ? "confirmed" : "failed";
  if (status === "confirmed") {
    const asset = `testnet-${manifest.deploymentId}:${manifest.chainId}:${settlement.toLowerCase()}`;
    const deltas = await transactionDeltas(payload.txHash as Hex, [asset], t.toAddress as Address);
    if (deltas[0]?.signedRaw !== fromDbRaw(t.amount)) throw new ConflictException("Transfer receipt mismatch", "OPERATION_UNRESOLVED");
  }
  return { status, txHash: payload.txHash };
}

export async function progressLocalTransfer(t: ChainTransfer): Promise<ChainTransfer> {
  const { status, txHash } = await perform(t);
  const data: Prisma.ChainTransferUpdateInput = { status, txHash, failureReason: status === "failed" ? "EXECUTION_REVERTED" : null };
  return db.chainTransfer.update({ where: { id: t.id }, data });
}

// Explicit local fixture prefunding. The journal identity is retained across
// restarts; a seed retry cannot issue additional test settlement tokens.
export async function seedLocalTreasury(key: string, toAddress: string, amount: Prisma.Decimal): Promise<void> {
  const result = await perform({ key: `seed:${key}`, fromAddress: "0x0000000000000000000000000000000000000000", toAddress, amount }, true);
  if (result.status !== "confirmed") throw new ServiceUnavailableException("Local fixture funding failed", "NETWORK_UNHEALTHY");
}
