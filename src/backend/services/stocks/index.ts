import type { Prisma, Stock } from "@/server/prisma";
import { db } from "@/server/db";
import type { StockDto } from "@/types/dto";
import { formatMinor } from "@/utils/money";
import { UnprocessableEntityException } from "@/utils/exceptions";

function toDto(stock: Stock): StockDto {
  return {
    id: stock.id,
    symbol: stock.symbol,
    name: stock.name,
    chain: stock.chain,
    decimals: stock.decimals,
    price_usdc: formatMinor(stock.simPriceMicroUsdc),
    simulated: true,
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

  async get(id: string): Promise<Stock> {
    const stock = await db.stock.findUnique({ where: { id } });
    if (!stock?.enabled) {
      throw new UnprocessableEntityException("Stock unavailable", "STOCK_UNAVAILABLE");
    }
    return stock;
  }

  async upsertCatalog(stocks: Prisma.StockCreateInput[]): Promise<void> {
    for (const stock of stocks) {
      await db.stock.upsert({
        where: { symbol: stock.symbol },
        create: stock,
        update: stock,
      });
    }
  }
}

export const stockService = new StockService();
