import { keccak256, type Address, type Hex, type TransactionReceipt } from "viem";

import { db, withTx } from "@/server/db";
import type { Prisma } from "@/server/prisma";
import { assertBetaStage } from "@/backend/integrations/onchain-policy";
import { chainObject, publicClientOn, relayerOn, rpcOn, walletClientOn } from "@/backend/services/onchain/chains";
import { manifestFor } from "@/backend/services/onchain/manifests";
import { allocateRelayerNonce, relayerLockKey } from "@/backend/services/execution/nonce";
import { txExists } from "@/backend/services/execution/receipts";
import { canonicalJson, sha256Hex } from "@/utils";
import { ConflictException } from "@/utils/exceptions";

// A relayer transaction that is not an onchain operation: deploying a customer's
// execution account or bumping its authorization epoch. `to: null` deploys `data`.
export type RelayerTransactionRequest = { to: Address | null; data: Hex };

const GAS_HEADROOM_PERCENT = 120n;

// Signs a relayer transaction once, under the network's relayer nonce lock, and
// stores the exact signed bytes (local_chain_transfers, which allocateRelayerNonce
// reads) before broadcasting. Every relayer transaction therefore takes its nonce
// from the same allocator as operations and managed transfers, so none can claim a
// nonce another has signed but not yet sent. A retry, or a concurrent caller with
// the same key, reuses the stored bytes instead of signing a second transaction.
export async function sendRelayerTransaction(
  chainId: number,
  key: string,
  request: RelayerTransactionRequest,
): Promise<TransactionReceipt> {
  assertBetaStage();
  const manifest = manifestFor(chainId);
  const requestHash = sha256Hex(
    canonicalJson(["relayer-transaction", manifest.deploymentId, request.to, request.data]),
  );
  let payload = await db.localChainTransfer.findUnique({ where: { key } });
  if (payload && (payload.requestHash !== requestHash || payload.deploymentId !== manifest.deploymentId)) {
    throw new ConflictException("Relayer transaction context changed; reconciliation required", "OPERATION_UNRESOLVED");
  }
  const client = publicClientOn(chainId);
  if (!payload) {
    const relayer = relayerOn(chainId);
    const estimate = await client.estimateGas({
      account: relayer.address,
      to: request.to,
      data: request.data,
    });
    const gas = (estimate * GAS_HEADROOM_PERCENT) / 100n;
    const gasPrice = BigInt(await rpcOn<Hex>(chainId, "eth_gasPrice"));
    payload = await withTx(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${relayerLockKey(chainId)}::bigint)`);
      const existing = await tx.localChainTransfer.findUnique({ where: { key } });
      if (existing) return existing;
      const nonce = await allocateRelayerNonce(tx, chainId);
      const signedTx = await walletClientOn(chainId).signTransaction({
        account: relayer,
        chain: chainObject(chainId),
        to: request.to,
        data: request.data,
        nonce,
        gas,
        gasPrice,
      });
      const input: Prisma.LocalChainTransferCreateInput = {
        key,
        deploymentId: manifest.deploymentId,
        requestHash,
        nonce,
        txHash: keccak256(signedTx),
        signedTx,
      };
      return tx.localChainTransfer.create({ data: input });
    });
  }
  const hash = payload.txHash as Hex;
  if (!(await txExists(hash, chainId))) {
    try {
      await client.sendRawTransaction({ serializedTransaction: payload.signedTx as Hex });
    } catch (error) {
      // A concurrent caller with the same key may have broadcast the same bytes.
      if (!(await txExists(hash, chainId))) throw error;
    }
  }
  return client.waitForTransactionReceipt({ hash });
}
