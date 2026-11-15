import { decodeEventLog, getEventSelector, type Hex, type Log, parseAbiItem } from "viem";

import { db } from "@/server/db";
import { policy } from "@/backend/config/policy";
import { now } from "@/backend/clock";
import { publicClientFor, readManifest, testnetService, testnetRpcUrl } from "@/backend/services/onchain/testnet";
import { fromDbRaw, toDbRaw } from "@/utils/asset-units";

export const WAD = 10n ** 18n;

export function shareEquivalentRaw(raw: bigint, multiplierWad: bigint): bigint {
  return (raw * multiplierWad) / WAD;
}

export function tokenPriceFromSharePrice(sharePriceMicroUsd: bigint, multiplierWad: bigint): bigint {
  return (sharePriceMicroUsd * multiplierWad) / WAD;
}

export function positionValueMicroUsd(raw: bigint, priceMicroUsd: bigint, decimals: number): bigint {
  return (raw * priceMicroUsd) / 10n ** BigInt(decimals);
}

export class StockActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockActionError";
  }
}

const multiplierScheduledEvent = parseAbiItem(
  "event MultiplierScheduled(uint256 indexed actionId, uint256 fromWad, uint256 toWad, uint64 effectiveAt)",
);
const actionCancelledEvent = parseAbiItem("event ActionCancelled(uint256 indexed actionId)");
const MULTIPLIER_SCHEDULED_TOPIC = getEventSelector(multiplierScheduledEvent);
const ACTION_CANCELLED_TOPIC = getEventSelector(actionCancelledEvent);

function decodeActionLog(log: Log): {
  kind: string;
  actionId: bigint;
  multiplierWad: bigint | null;
  effectiveAt: Date | null;
} | null {
  if (log.topics[0] === MULTIPLIER_SCHEDULED_TOPIC) {
    try {
      const decoded = decodeEventLog({
        abi: [multiplierScheduledEvent],
        data: log.data,
        topics: log.topics,
      });
      const args = decoded.args as unknown as { actionId: bigint; toWad: bigint; effectiveAt: bigint };
      return {
        kind: "multiplier_scheduled",
        actionId: args.actionId,
        multiplierWad: args.toWad,
        effectiveAt: new Date(Number(args.effectiveAt) * 1000),
      };
    } catch {
      return null;
    }
  }
  if (log.topics[0] === ACTION_CANCELLED_TOPIC) {
    try {
      const decoded = decodeEventLog({
        abi: [actionCancelledEvent],
        data: log.data,
        topics: log.topics,
      });
      const args = decoded.args;
      return { kind: "action_cancelled", actionId: args.actionId, multiplierWad: null, effectiveAt: null };
    } catch {
      return null;
    }
  }
  return null;
}

class StockActionService {
  async effectiveMultiplier(stockId: string, at: Date): Promise<bigint> {
    const stock = await db.stock.findUnique({ where: { id: stockId } });
    if (!stock) throw new StockActionError(`Unknown stock ${stockId}`);
    if (!stock.networkId) return fromDbRaw(stock.multiplierWad);
    const actions = await db.stockAction.findMany({
      where: { networkId: stock.networkId, stockId, orphanedAt: null },
      orderBy: [{ effectiveAt: "asc" }, { blockNumber: "asc" }, { logIndex: "asc" }],
    });
    const cancelled = new Set<bigint>();
    for (const action of actions) {
      if (action.kind !== "action_cancelled" || (action.cancelledAt && action.cancelledAt > at)) continue;
      const payload = action.payload as { actionId?: string } | null;
      if (payload?.actionId) cancelled.add(BigInt(payload.actionId));
    }
    let wad = WAD;
    for (const action of actions) {
      if (action.kind !== "multiplier_scheduled") continue;
      const payload = action.payload as { actionId?: string } | null;
      if (payload?.actionId && cancelled.has(BigInt(payload.actionId))) continue;
      if (action.effectiveAt && action.effectiveAt > at) continue;
      if (action.multiplierWad) wad = fromDbRaw(action.multiplierWad);
    }
    return wad;
  }

  async ingest(networkId: string, throughBlock: bigint): Promise<number> {
    const network = await db.onchainNetwork.findUnique({ where: { id: networkId } });
    if (!network) throw new StockActionError(`Unknown network ${networkId}`);
    const stocks = await db.stock.findMany({ where: { networkId } });
    if (stocks.length === 0) return 0;
    const manifest = readManifest();
    if (network.deploymentId !== manifest.deploymentId || !(await testnetService.verify(manifest)).ok) throw new StockActionError("Deployment identity mismatch");
    const client = publicClientFor(testnetRpcUrl());
    const head = await client.getBlockNumber();
    if (throughBlock + BigInt(policy.onchain.requiredConfirmations) > head) throw new StockActionError("Action ingestion requires finalized blocks");
    const tokenAddresses = stocks.map((s) => s.tokenAddress as Hex);
    const logs = await client.getLogs({
      address: tokenAddresses,
      fromBlock: 0n,
      toBlock: throughBlock,
    });
    let inserted = 0;
    for (const log of logs) {
      const decoded = decodeActionLog(log);
      if (!decoded) continue;
      const stock = stocks.find((s) => s.tokenAddress.toLowerCase() === log.address.toLowerCase());
      if (!stock) continue;
      try {
        await db.stockAction.create({
          data: {
            networkId,
            stockId: stock.id,
            kind: decoded.kind,
            txHash: log.transactionHash ?? "0x",
            logIndex: log.logIndex,
            blockNumber: toDbRaw(log.blockNumber ?? 0n),
            blockHash: log.blockHash,
            multiplierWad: decoded.multiplierWad === null ? null : toDbRaw(decoded.multiplierWad),
            effectiveAt: decoded.effectiveAt,
            cancelledAt: decoded.kind === "action_cancelled" ? now() : null,
            payload: { actionId: decoded.actionId.toString() },
          },
        });
        inserted += 1;
      } catch (error) {
        if (this.isUniqueViolation(error)) continue;
        throw error;
      }
    }
    for (const stock of stocks) {
      const wad = await this.effectiveMultiplier(stock.id, now());
      await db.stock.update({
        where: { id: stock.id },
        data: { multiplierWad: toDbRaw(wad) },
      });
    }
    await db.onchainNetwork.update({
      where: { id: networkId },
      data: { finalizedBlock: toDbRaw(throughBlock) },
    });
    return inserted;
  }

  async rollbackAfterFinality(networkId: string, finalizedBlock: bigint): Promise<number> {
    const result = await db.stockAction.updateMany({
      where: { networkId, blockNumber: { gt: toDbRaw(finalizedBlock) }, orphanedAt: null },
      data: { orphanedAt: now() },
    });
    await db.onchainNetwork.update({
      where: { id: networkId },
      data: { finalizedBlock: toDbRaw(finalizedBlock) },
    });
    const stocks = await db.stock.findMany({ where: { networkId } });
    for (const stock of stocks) await db.stock.update({ where: { id: stock.id }, data: { multiplierWad: toDbRaw(await this.effectiveMultiplier(stock.id, now())) } });
    return result.count;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    );
  }
}

export const stockActionService = new StockActionService();
