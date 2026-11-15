import { type Address, type Hex } from "viem";

import { db } from "@/server/db";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { policy } from "@/backend/config/policy";
import { hydrexPoolAbi, settlementTokenAbi } from "@/backend/services/onchain/abis";
import { publicClientFor, readManifest, testnetService } from "@/backend/services/onchain/testnet";
import { fromDbRaw } from "@/utils/asset-units";
import type { CheckResult } from ".";

const UNRESOLVED = ["pending", "prepared", "signed", "broadcast", "confirmed", "unknown", "needs_review"] as const;

// All quantities are compared at one canonical block. An account with unfinished
// work is explicitly incomplete; a live balance is never compared to a stale book.
export async function onchainChecks(): Promise<CheckResult[]> {
  const networks = await db.onchainNetwork.findMany();
  if (networks.length === 0) return [];
  const results: CheckResult[] = [];
  for (const network of networks) {
    const check = `onchain:${network.deploymentId}`;
    const unavailable = (reason: string): void => {
      results.push({ check: `${check}:${reason}`, expected: "0", observed: null, delta: null, threshold: "0", status: "unavailable" });
    };
    try {
      const manifest = readManifest();
      const verified = await testnetService.verify(manifest);
      if (!verified.ok || manifest.deploymentId !== network.deploymentId || manifest.networkId !== network.networkId) {
        unavailable("deployment_mismatch");
        await db.onchainOperation.updateMany({ where: { networkId: network.id, status: { in: [...UNRESOLVED] } }, data: { status: "needs_review", errorReason: "DEPLOYMENT_MISMATCH" } });
        continue;
      }
      const client = publicClientFor();
      const head = await client.getBlockNumber();
      const depth = BigInt(policy.onchain.requiredConfirmations);
      if (head < depth) { unavailable("finality_unavailable"); continue; }
      const cutoff = await client.getBlock({ blockNumber: head - depth });
      const wallets = await db.wallet.findMany({ where: { executionAddress: { not: null } } });
      const stocks = await db.stock.findMany({ where: { networkId: network.id } });
      const compare = (name: string, expected: bigint, observed: bigint): void => {
        const delta = observed - expected;
        results.push({ check: `${check}:${name}:block:${cutoff.number}:${cutoff.hash}`, expected: expected.toString(), observed: observed.toString(), delta: delta.toString(), threshold: "0", status: delta === 0n ? "ok" : "breach" });
      };
      for (const wallet of wallets) {
        const operations = await db.onchainOperation.findMany({ where: { networkId: network.id, userId: wallet.userId } });
        if (operations.some((op) => ["unknown", "needs_review"].includes(op.status))) {
          unavailable(`account:${wallet.id}:unresolved`);
          continue;
        }
        if (operations.some((op) => UNRESOLVED.includes(op.status as typeof UNRESOLVED[number]) || (op.blockNumber && fromDbRaw(op.blockNumber) > cutoff.number))) {
          results.push({ check: `${check}:account:${wallet.id}:in_flight`, expected: "0", observed: null, delta: null, threshold: "0", status: "in_flight" });
          continue;
        }
        const accounts = [wallet.executionAddress as Address];
        const managed = await db.custodyProfile.findMany({ where: { walletId: wallet.id, kind: "provider_managed", managedAddress: { not: null } } });
        for (const profile of managed) accounts.push(profile.managedAddress as Address);
        const balance = async (token: Address): Promise<bigint> => {
          let total = 0n;
          for (const address of accounts) total += await client.readContract({ address: token, abi: settlementTokenAbi, functionName: "balanceOf", args: [address], blockNumber: cutoff.number });
          return total;
        };
        const balances = await ledgerService.balancesForUser(wallet.userId);
        const get = (code: string): bigint => balances.get(code) ?? 0n;
        const cash = get(acct.userCash(wallet.userId, "testnet").code) + get(acct.userReserved(wallet.userId, "testnet").code) + get(acct.userEarnings(wallet.userId, "testnet").code);
        compare(`cash:${wallet.id}`, cash, await balance(manifest.contracts.TestSettlementToken!.address));
        for (const stock of stocks) {
          const owned = get(acct.userStock(wallet.userId, stock.id).code) + get(acct.userStockReserved(wallet.userId, stock.id).code);
          compare(`stock:${wallet.id}:${stock.id}`, owned, await balance(stock.tokenAddress as Address));
        }
        const positions = await db.strategyPosition.findMany({ where: { userId: wallet.userId }, include: { strategy: true } });
        for (const position of positions) {
          const pool = (position.strategy.provenance as { pool?: Hex }).pool;
          if (!pool) continue;
          const shares = await client.readContract({ address: pool, abi: hydrexPoolAbi, functionName: "sharesOf", args: [wallet.executionAddress as Address], blockNumber: cutoff.number });
          const samePool = positions.filter((p) => (p.strategy.provenance as { pool?: string }).pool === pool);
          const expected = samePool.reduce((sum, p) => sum + fromDbRaw(p.receiptRaw), 0n);
          compare(`receipts:${wallet.id}:${pool}`, expected, shares);
        }
      }
      if (wallets.length === 0) results.push({ check: `${check}:identity`, expected: "0", observed: "0", delta: "0", threshold: "0", status: "ok" });
    } catch {
      unavailable("read_unavailable");
    }
  }
  return results;
}
