import type { Prisma, Stock } from "@/server/prisma";
import { db } from "@/server/db";
import type { StockDto } from "@/types/dto";
import { fetchStocksPage } from "@/backend/services/stocks/base-stocks-client";
import { standInFor, stockReference, type ReferenceStock } from "@/backend/services/stocks/reference";
import { stockHistory } from "@/backend/services/stocks/history";
import { ratesService } from "@/backend/services/rates";
import type { Rate } from "@/utils/money";
import { fromDbRaw, toDbRaw } from "@/utils/asset-units";
import { BadRequestException, NotFoundException, UnprocessableEntityException } from "@/utils/exceptions";
import { formatMinor } from "@/utils/money";

export function isTestnetStock(stock: Stock): boolean {
  return stock.chain === "testnet" && stock.networkId !== null;
}

function toDto(stock: Stock): StockDto {
  return {
    id: stock.id,
    symbol: stock.symbol,
    name: stock.name,
    chain: stock.chain,
    decimals: stock.decimals,
    price_usdc: formatMinor(stock.simPriceMicroUsdc),
    simulated: true,
    asset_key: stock.assetKey,
    kind: stock.kind,
    rights: stock.rightsSummary,
    paused: stock.paused,
    delisted: stock.delisted,
    multiplier_wad: fromDbRaw(stock.multiplierWad).toString(),
    reference_price_usdc:
      stock.referencePriceMicroUsd === null ? null : formatMinor(stock.referencePriceMicroUsd),
    reference_basis: stock.referenceBasis,
    reference_as_of: stock.referenceAsOf?.toISOString() ?? null,
    provenance: stock.provenance,
    stand_in_for: standInFor(stock),
    tradable: stock.enabled && !stock.paused && !stock.delisted && stock.assetKey !== null,
  };
}

class StockService {
  async list(): Promise<StockDto[]> {
    const stocks = await db.stock.findMany({
      where: { enabled: true },
      orderBy: { symbol: "asc" },
    });
    return stocks.map(toDto);
  }

  async listAll(): Promise<StockDto[]> {
    const stocks = await db.stock.findMany({ orderBy: { symbol: "asc" } });
    return stocks.map(toDto);
  }

  async get(id: string): Promise<Stock> {
    const stock = await db.stock.findUnique({ where: { id } });
    if (!stock?.enabled) {
      throw new UnprocessableEntityException("Stock unavailable", "STOCK_UNAVAILABLE");
    }
    return stock;
  }

  // Catalog detail: unknown IDs are 404; paused/delisted rows stay visible with
  // their flags so clients can explain why quoting is unavailable.
  async getDto(id: string): Promise<StockDto> {
    const stock = await db.stock.findUnique({ where: { id } });
    if (!stock) {
      throw new NotFoundException("Stock not found", "NOT_FOUND");
    }
    return toDto(stock);
  }

  async upsertCatalog(stocks: Prisma.StockCreateInput[]): Promise<void> {
    for (const stock of stocks) {
      if (!stock.assetKey) {
        throw new BadRequestException("Catalog rows require an assetKey");
      }
      await db.stock.upsert({
        where: { assetKey: stock.assetKey },
        create: stock,
        update: stock,
      });
    }
  }

  // Pages the live Tokenized Stocks API to the last page, then updates reference
  // prices in one transaction. Rows are matched by asset key and by
  // provenance.standInFor (Base Sepolia stand-ins); rows are never created or
  // enabled here. Any fetch/parse failure aborts before a single row is written, so
  // a stale, missing or malformed response leaves the catalog unchanged.
  async syncReference(): Promise<{ updated: number; skipped: number }> {
    const stocks: ReferenceStock[] = [];
    let next: string | null = null;
    do {
      const page = stockReference.parseLive(await fetchStocksPage(next));
      stocks.push(...page.stocks);
      next = page.next;
    } while (next !== null);
    let updated = 0;
    let skipped = 0;
    const updatedIds: string[] = [];
    await db.$transaction(async (tx) => {
      for (const reference of stocks) {
        const data = {
          referencePriceMicroUsd: reference.referencePriceMicroUsd,
          referenceBasis: reference.referenceBasis,
          referenceAsOf: reference.referenceAsOf,
          multiplierWad: toDbRaw(reference.multiplierWad),
        };
        const byAsset = await tx.stock.updateMany({ where: { assetKey: reference.assetKey }, data });
        const byStandIn = await tx.stock.updateMany({
          where: { provenance: { path: ["standInFor"], equals: reference.assetKey } },
          data,
        });
        const count = byAsset.count + byStandIn.count;
        if (count === 0) {
          skipped += 1;
        } else {
          updated += count;
          const rows = await tx.stock.findMany({
            where: {
              OR: [
                { assetKey: reference.assetKey },
                { provenance: { path: ["standInFor"], equals: reference.assetKey } },
              ],
            },
            select: { id: true },
          });
          updatedIds.push(...rows.map((row) => row.id));
        }
      }
    });
    // After the update transaction, keep one price snapshot per updated row that
    // has a price and a time, at the current payout rate (null when rates are down).
    if (updatedIds.length > 0) {
      let rate: Rate | null = null;
      try {
        rate = (await ratesService.display()).payoutRate;
      } catch {
        rate = null;
      }
      await db.$transaction(async (tx) => {
        for (const id of updatedIds) {
          const row = await tx.stock.findUnique({ where: { id } });
          if (row && row.referencePriceMicroUsd !== null && row.referenceBasis && row.referenceAsOf) {
            await stockHistory.record(
              tx,
              row.id,
              {
                priceMicroUsd: row.referencePriceMicroUsd,
                basis: row.referenceBasis,
                asOf: row.referenceAsOf,
                multiplierWad: fromDbRaw(row.multiplierWad),
              },
              rate,
            );
          }
        }
      });
    }
    return { updated, skipped };
  }
}

export const stockService = new StockService();
