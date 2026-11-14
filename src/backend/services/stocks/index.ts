import type { Prisma, Stock } from "@/server/prisma";
import { db } from "@/server/db";
import type { StockDto } from "@/types/dto";
import { fromDbRaw } from "@/utils/asset-units";
import { BadRequestException, UnprocessableEntityException } from "@/utils/exceptions";
import { formatMinor } from "@/utils/money";

export function isTestnetStock(stock: Stock): boolean {
  return stock.assetKey?.startsWith("testnet:") ?? false;
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
}

export const stockService = new StockService();
