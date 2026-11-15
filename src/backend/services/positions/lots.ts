import type { PositionLot } from "@/server/prisma";
import type { DbClient } from "@/server/db";
import { fromDbRaw, toDbRaw, toDbSignedRaw } from "@/utils/asset-units";
import { now } from "@/backend/clock";

export type LotFill = {
  userId: string;
  stockId: string;
  asset: string;
  side: "buy" | "sell";
  quantityRaw: bigint;
  cashRaw: bigint; // settlement spent (buy) or received before fee (sell)
  feeRaw: bigint;
  source: string;
  operationId: string;
  fxRateKobo?: bigint | null; // kobo per USD at acquisition, when known
};

export type LotConsumption = {
  realizedGainRaw: bigint;
  principalReturnedRaw: bigint;
  costOfSoldRaw: bigint;
};

// FIFO lot accounting. Buys open lots at exact cost (cash spent + fee, with the
// acquisition FX rate when known). Sells consume oldest lots first; the residual
// cost is assigned to the final disposal so the remaining lot cost is preserved
// exactly.
export async function applyFillToLots(client: DbClient, fill: LotFill): Promise<LotConsumption> {
  if (fill.quantityRaw <= 0n) throw new Error("Fill quantity must be positive");
  if (fill.side === "buy") {
    const cost = fill.cashRaw + fill.feeRaw;
    await client.positionLot.create({
      data: {
        userId: fill.userId,
        stockId: fill.stockId,
        asset: fill.asset,
        operationId: fill.operationId,
        quantity: toDbRaw(fill.quantityRaw),
        costUsdc: toDbRaw(cost),
        fxRateKobo: fill.fxRateKobo ?? null,
        source: fill.source,
      },
    });
    return { realizedGainRaw: 0n, principalReturnedRaw: 0n, costOfSoldRaw: 0n };
  }
  // sell: FIFO consumption
  const lots = await client.positionLot.findMany({
    where: { userId: fill.userId, stockId: fill.stockId, closedAt: null },
    orderBy: [{ openedAt: "asc" }, { id: "asc" }],
  });
  if (lots.reduce((sum, lot) => sum + fromDbRaw(lot.quantity), 0n) < fill.quantityRaw) {
    throw new Error("Sell exceeds tracked lot quantity");
  }
  let remaining = fill.quantityRaw;
  let costOfSold = 0n;
  for (const lot of lots) {
    if (remaining === 0n) break;
    const lotQty = fromDbRaw(lot.quantity);
    const lotCost = fromDbRaw(lot.costUsdc);
    const take = remaining < lotQty ? remaining : lotQty;
    // Pro-rata cost of the sold slice; on the final disposal the residual cost is
    // assigned so the lot cost is preserved exactly (no dust leakage).
    const sliceCost = take === lotQty ? lotCost : (lotCost * take) / lotQty;
    costOfSold += sliceCost;
    const left = lotQty - take;
    const takenBefore = fill.quantityRaw - remaining;
    const takenAfter = takenBefore + take;
    const proceedsSlice = (fill.cashRaw * takenAfter) / fill.quantityRaw - (fill.cashRaw * takenBefore) / fill.quantityRaw;
    const feeSlice = (fill.feeRaw * takenAfter) / fill.quantityRaw - (fill.feeRaw * takenBefore) / fill.quantityRaw;
    await client.positionLot.update({
      where: { id: lot.id },
      data: {
        quantity: toDbRaw(left),
        costUsdc: toDbRaw(lotCost - sliceCost),
        closedAt: left === 0n ? now() : null,
        realizedUsdc: toDbSignedRaw(fromDbRaw(lot.realizedUsdc) + proceedsSlice - feeSlice - sliceCost),
      },
    });
    remaining -= take;
  }
  if (remaining > 0n) {
    // Selling more than the tracked lots: the unknown external basis is reported as
    // unavailable by the caller, never zero cost.
    throw new Error("Sell exceeds tracked lot quantity");
  }
  const proceeds = fill.cashRaw - fill.feeRaw;
  return {
    realizedGainRaw: proceeds - costOfSold,
    principalReturnedRaw: costOfSold,
    costOfSoldRaw: costOfSold,
  };
}

export async function openLotsFor(
  client: DbClient,
  userId: string,
  stockId: string,
): Promise<PositionLot[]> {
  return client.positionLot.findMany({
    where: { userId, stockId, closedAt: null },
    orderBy: { openedAt: "asc" },
  });
}

export async function totalCostBasis(client: DbClient, userId: string, stockId: string): Promise<bigint> {
  const lots = await openLotsFor(client, userId, stockId);
  return lots.reduce((sum, lot) => sum + fromDbRaw(lot.costUsdc), 0n);
}

export async function totalRealized(client: DbClient, userId: string, stockId: string): Promise<bigint> {
  const lots = await client.positionLot.findMany({ where: { userId, stockId } });
  return lots.reduce((sum, lot) => sum + fromDbRaw(lot.realizedUsdc), 0n);
}

export async function hasAnyLot(client: DbClient, userId: string, stockId: string): Promise<boolean> {
  return (await client.positionLot.count({ where: { userId, stockId } })) > 0;
}
