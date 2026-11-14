import { decodeEventLog, getEventSelector, type Hex, type Log, parseAbiItem } from "viem";

import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { publicClientFor, testnetRpcUrl } from "@/backend/services/onchain/testnet";
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

function decodeActionLog(log: Log): { kind: string; multiplierWad: bigint | null; effectiveAt: Date | null } | null {
  if (log.topics[0] === MULTIPLIER_SCHEDULED_TOPIC) {
    try {
      const decoded = decodeEventLog({
        abi: [multiplierScheduledEvent],
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      const args = decoded.args as unknown as { toWad: bigint; effectiveAt: bigint };
      return {
        kind: "multiplier_scheduled",
        multiplierWad: args.toWad,
        effectiveAt: new Date(Number(args.effectiveAt) * 1000),
      };
    } catch {
      return null;
    }
  }
  if (log.topics[0] === ACTION_CANCELLED_TOPIC) {
    return { kind: "action_cancelled", multiplierWad: null, effectiveAt: null };
  }
  return null;
}

class StockActionService {
  async effectiveMultiplier(stockId: string, at: Date): Promise<bigint> {
    const stock = await db.stock.findUnique({ where: { id: stockId } });
    if (!stock) throw new StockActionError(`Unknown stock ${stockId}`);
    if (!stock.networkId) return fromDbRaw(stock.multiplierWad);
    const actions = await db.stockAction.findMany({
      where: { networkId: stock.networkId, stockId },
      orderBy: [{ blockNumber: "asc" }, { logIndex: "asc" }],
    });
    let wad = WAD;
    for (const action of actions) {
      if (action.cancelledAt) continue;
      if (action.effectiveAt && action.effectiveAt > at) continue;
      if (action.multiplierWad) wad = fromDbRaw(action.multiplierWad);
    }
    return wad;
  }

  async ingest(networkId: string, throughBlock: bigint): Promise<number> {
    const network = await db.onchainNetwork.findUnique({ where: { networkId } });
    if (!network) throw new StockActionError(`Unknown network ${networkId}`);
    const stocks = await db.stock.findMany({ where: { networkId } });
    if (stocks.length === 0) return 0;
    const client = publicClientFor(testnetRpcUrl());
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
            multiplierWad: decoded.multiplierWad === null ? null : toDbRaw(decoded.multiplierWad),
            effectiveAt: decoded.effectiveAt,
            cancelledAt: decoded.kind === "action_cancelled" ? now() : null,
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
      where: { networkId },
      data: { finalizedBlock: toDbRaw(throughBlock) },
    });
    return inserted;
  }

  async rollbackAfterFinality(networkId: string, finalizedBlock: bigint): Promise<number> {
    const result = await db.stockAction.deleteMany({
      where: { networkId, blockNumber: { gt: toDbRaw(finalizedBlock) } },
    });
    await db.onchainNetwork.update({
      where: { networkId },
      data: { finalizedBlock: toDbRaw(finalizedBlock) },
    });
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
