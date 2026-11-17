import type { Prisma } from "@/server/prisma";
import { db, type Tx } from "@/server/db";
import { fromDbRaw } from "@/utils/asset-units";
import type { Rate } from "@/utils/money";
import type { ChartRange } from "@/types/app";

export type { ChartRange } from "@/types/app";

const RANGES: Record<ChartRange, { windowSeconds: number | null; bucketSeconds: number }> = {
  "1D": { windowSeconds: 86_400, bucketSeconds: 900 },
  "1W": { windowSeconds: 604_800, bucketSeconds: 7_200 },
  "1M": { windowSeconds: 2_592_000, bucketSeconds: 28_800 },
  "3M": { windowSeconds: 7_776_000, bucketSeconds: 86_400 },
  "1Y": { windowSeconds: 31_536_000, bucketSeconds: 86_400 },
  ALL: { windowSeconds: null, bucketSeconds: 604_800 },
};

const MAX_POINTS = 400;

export type SnapshotRef = {
  priceMicroUsd: bigint;
  basis: string;
  asOf: Date;
  multiplierWad: bigint;
};

export type HistoryPoint = {
  t: Date;
  priceMicroUsd: bigint;
  basis: string;
  multiplierWad: bigint;
  rate: Rate | null;
};

class StockHistoryService {
  // One row per (stock, reference time); a repeated asOf updates in place.
  async record(
    client: Tx | typeof db,
    stockId: string,
    ref: SnapshotRef,
    rate: Rate | null,
  ): Promise<void> {
    const data: Prisma.StockPriceSnapshotCreateInput = {
      stockId,
      asOf: ref.asOf,
      priceMicroUsd: ref.priceMicroUsd,
      basis: ref.basis,
      multiplierWad: ref.multiplierWad.toString(),
      rateKobo: rate?.kobo ?? null,
      rateMicroUsd: rate?.microUsd ?? null,
    };
    await client.stockPriceSnapshot.upsert({
      where: { stockId_asOf: { stockId, asOf: ref.asOf } },
      create: data,
      update: {
        priceMicroUsd: ref.priceMicroUsd,
        basis: ref.basis,
        multiplierWad: ref.multiplierWad.toString(),
        rateKobo: rate?.kobo ?? null,
        rateMicroUsd: rate?.microUsd ?? null,
      },
    });
  }

  // Snapshots in the range, bucketed, keeping the last snapshot per bucket,
  // ascending, capped at MAX_POINTS.
  async series(stockId: string, range: ChartRange, at: Date): Promise<HistoryPoint[]> {
    const spec = RANGES[range];
    const where: Prisma.StockPriceSnapshotWhereInput = { stockId, asOf: { lte: at } };
    if (spec.windowSeconds !== null) {
      where.asOf = { lte: at, gte: new Date(at.getTime() - spec.windowSeconds * 1_000) };
    }
    const rows = await db.stockPriceSnapshot.findMany({
      where,
      orderBy: { asOf: "asc" },
    });
    const bucketMs = spec.bucketSeconds * 1_000;
    const byBucket = new Map<bigint, (typeof rows)[number]>();
    for (const row of rows) {
      const bucket = BigInt(Math.floor(row.asOf.getTime() / bucketMs));
      byBucket.set(bucket, row);
    }
    const points = [...byBucket.values()]
      .sort((a, b) => a.asOf.getTime() - b.asOf.getTime())
      .slice(-MAX_POINTS)
      .map((row) => ({
        t: row.asOf,
        priceMicroUsd: row.priceMicroUsd,
        basis: row.basis,
        multiplierWad: fromDbRaw(row.multiplierWad),
        rate:
          row.rateKobo !== null && row.rateMicroUsd !== null
            ? { kobo: row.rateKobo, microUsd: row.rateMicroUsd }
            : null,
      }));
    return points;
  }

  async priceBefore(
    stockId: string,
    at: Date,
  ): Promise<{
    priceMicroUsd: bigint;
    basis: string;
    multiplierWad: bigint;
    rate: Rate | null;
    asOf: Date;
  } | null> {
    const row = await db.stockPriceSnapshot.findFirst({
      where: { stockId, asOf: { lte: at } },
      orderBy: { asOf: "desc" },
    });
    if (!row) return null;
    return {
      priceMicroUsd: row.priceMicroUsd,
      basis: row.basis,
      multiplierWad: fromDbRaw(row.multiplierWad),
      rate:
        row.rateKobo !== null && row.rateMicroUsd !== null
          ? { kobo: row.rateKobo, microUsd: row.rateMicroUsd }
          : null,
      asOf: row.asOf,
    };
  }
}

export const stockHistory = new StockHistoryService();
