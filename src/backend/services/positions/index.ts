import { db, type DbClient } from "@/server/db";
import { now } from "@/backend/clock";
import { unpack } from "@/backend/services/execution";
import { acct } from "@/backend/services/ledger/accounts";
import { ledgerService } from "@/backend/services/ledger";
import { positionValueMicroUsd, shareEquivalentRaw, stockActionService } from "@/backend/services/stocks/corporate-actions";
import { stockService } from "@/backend/services/stocks";
import type { AssetAmount } from "@/backend/services/onchain/types";
import type { PositionView } from "@/types/dto";
import { fromDbRaw } from "@/utils/asset-units";

import { applyFillToLots, hasAnyLot, totalCostBasis, totalRealized } from "./lots";

// Applies a finalized onchain operation to FIFO lots. Called from investment
// settlement inside the same transaction.
export async function applyFill(client: DbClient, operationId: string, feeRaw = 0n): Promise<void> {
  const op = await client.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
  if (op.status !== "finalized") return;
  const quote = unpack((op.expected as { quote?: unknown }).quote) as {
    stockId: string;
    input: AssetAmount;
    expectedOutput: AssetAmount;
  };
  const actual = unpack(op.actual) as { input?: AssetAmount; output?: AssetAmount };
  const stock = await stockService.get(quote.stockId);
  const isBuy = actual.output?.asset === stock.assetKey;
  await applyFillToLots(client, {
    userId: op.userId,
    stockId: quote.stockId,
    asset: stock.assetKey ?? quote.expectedOutput.asset,
    side: isBuy ? "buy" : "sell",
    quantityRaw: isBuy ? (actual.output?.raw ?? 0n) : (actual.input?.raw ?? 0n),
    cashRaw: isBuy ? (actual.input?.raw ?? 0n) : (actual.output?.raw ?? 0n),
    feeRaw,
    source: op.providerId,
    operationId: op.id,
  });
}

class PositionService {
  async applyFill(client: DbClient, operationId: string, feeRaw = 0n): Promise<void> {
    return applyFill(client, operationId, feeRaw);
  }

  // Multiplier-aware positions with cost-basis status and signed performance.
  // Valuation uses share-equivalent x underlying share price only (never both
  // multipliers); unavailable reference data yields null valuation, not zero.
  async list(userId: string): Promise<PositionView[]> {
    const balances = await ledgerService.balancesForUser(userId);
    const stocks = await db.stock.findMany();
    const positions: PositionView[] = [];
    const strategyRawByStock = new Map<string, bigint>();
    const strategyPositions = await db.strategyPosition.findMany({ where: { userId } });
    for (const sp of strategyPositions) {
      const strategy = await db.strategy.findUnique({ where: { id: sp.strategyId } });
      const stockId = (strategy?.provenance as { stockId?: string } | null)?.stockId;
      if (stockId) {
        strategyRawByStock.set(stockId, (strategyRawByStock.get(stockId) ?? 0n) + fromDbRaw(sp.receiptRaw));
      }
    }
    for (const stock of stocks) {
      const owned = balances.get(acct.userStock(userId, stock.id).code) ?? 0n;
      const reserved = balances.get(acct.userStockReserved(userId, stock.id).code) ?? 0n;
      const strategyRaw = strategyRawByStock.get(stock.id) ?? 0n;
      if (owned <= 0n && reserved <= 0n && strategyRaw <= 0n) continue;
      const multiplierWad = await stockActionService.effectiveMultiplier(stock.id, now());
      const shareEquivalent = shareEquivalentRaw(owned, multiplierWad);
      const hasLots = await hasAnyLot(db, userId, stock.id);
      const costBasis = hasLots ? await totalCostBasis(db, userId, stock.id) : null;
      const realized = await totalRealized(db, userId, stock.id);
      let valueMicroUsd: bigint | null = null;
      let valuationStatus: "ok" | "unavailable" = "ok";
      if (stock.referencePriceMicroUsd !== null && stock.referenceAsOf) {
        // share-equivalent x share price: the multiplier is applied exactly once.
        valueMicroUsd = positionValueMicroUsd(shareEquivalent, stock.referencePriceMicroUsd, 18);
      } else {
        valuationStatus = "unavailable";
      }
      const unrealized =
        valueMicroUsd !== null && costBasis !== null
          ? valueMicroUsd - costBasis
          : null;
      positions.push({
        stock_id: stock.id,
        symbol: stock.symbol,
        asset: stock.assetKey,
        raw_owned: owned.toString(),
        raw_reserved: reserved.toString(),
        strategy_raw: strategyRaw.toString(),
        multiplier_wad: multiplierWad.toString(),
        multiplier_as_of: stock.referenceAsOf?.toISOString() ?? null,
        share_equivalent_raw: shareEquivalent.toString(),
        cost_basis_status: costBasis === null ? "basis_unavailable" : "available",
        cost_basis_usdc: costBasis === null ? null : costBasis.toString(),
        realized_usdc: realized.toString(),
        unrealized_usdc: unrealized === null ? null : unrealized.toString(),
        value_usdc: valueMicroUsd === null ? null : valueMicroUsd.toString(),
        valuation_status: valuationStatus,
        paused: stock.paused,
        delisted: stock.delisted,
      });
    }
    return positions;
  }
}

export const positionService = new PositionService();
