import type { Stock } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { productIdForStock } from "@/backend/content/earn-products";
import { STOCK_PROFILES } from "@/backend/content/stock-profiles";
import { WAD } from "@/backend/services/stocks/corporate-actions";
import { stockHistory, type ChartRange } from "@/backend/services/stocks/history";
import {
  referenceDisplay,
  referenceUsable,
  sharePriceMicroUsd,
} from "@/backend/services/stocks/reference";
import { ratesService } from "@/backend/services/rates";
import { positionService } from "@/backend/services/positions";
import { customerChain } from "@/backend/services/app/network";
import { displayValue } from "@/backend/services/app/valuation";
import { fromDbRaw } from "@/utils/asset-units";
import { NotFoundException } from "@/utils/exceptions";
import type { Rate } from "@/utils/money";

import { sharesMicroOf, toKobo } from "./format";

export type AppTrading = "available" | "prices_updating" | "paused";
export type AppPriceStatus = "live" | "delayed" | "unavailable";
export type AppStockRefDto = {
  id: string;
  ticker: string;
  name: string;
  logo_path: string | null;
};
export type AppStockListItemDto = AppStockRefDto & {
  sector: string;
  price_kobo: string | null;
  price_usd_micro: string | null;
  price_status: AppPriceStatus;
  price_as_of: string | null;
  change_24h_bps: number | null;
  trading: AppTrading;
  on_watchlist: boolean;
  is_test: boolean;
};
export type AppPositionSummaryDto = {
  shares_micro: string;
  value_kobo: string | null;
  price_status: AppPriceStatus;
};
export type AppStockDetailDto = AppStockListItemDto & {
  summary: string;
  your_position: AppPositionSummaryDto | null;
  earn_product_id: string | null;
  documents: ["how-shares-are-held"];
};
export type AppChartDto = {
  range: ChartRange;
  status: "ok" | "not_enough_data";
  points: { t: string; price_kobo: string }[];
  change_bps: number | null;
};

function profileOf(stock: Stock) {
  return stock.displayTicker ? STOCK_PROFILES[stock.displayTicker] : undefined;
}

// Share price (micro-USD per share) recorded in a snapshot row.
export function sharePriceFromSnapshot(
  priceMicroUsd: bigint,
  basis: string,
  multiplierWad: bigint,
): bigint {
  const tokenPrice =
    basis === "token_nav" ? priceMicroUsd : (priceMicroUsd * multiplierWad) / WAD;
  return (tokenPrice * WAD) / multiplierWad;
}

class AppCatalogService {
  inCatalog(stock: Stock): boolean {
    return (
      stock.chain === customerChain() &&
      stock.enabled &&
      !stock.delisted &&
      stock.displayTicker !== null &&
      stock.displayTicker in STOCK_PROFILES
    );
  }

  stockRef(stock: Stock): AppStockRefDto {
    const profile = profileOf(stock);
    return {
      id: stock.id,
      ticker: stock.displayTicker ?? stock.symbol,
      name: profile?.name ?? stock.name,
      logo_path: profile?.logoPath ?? null,
    };
  }

  private tradingStatus(stock: Stock, at: Date): AppTrading {
    if (stock.paused || stock.delisted) return "paused";
    if (referenceUsable(stock, at)) return "available";
    return "prices_updating";
  }

  private async change24hBps(
    stock: Stock,
    sharePrice: bigint | null,
    rate: Rate | null,
    at: Date,
  ): Promise<number | null> {
    if (sharePrice === null || rate === null || sharePrice <= 0n) return null;
    const before = await stockHistory.priceBefore(stock.id, new Date(at.getTime() - 86_400_000));
    if (!before) return null;
    const beforeShare = sharePriceFromSnapshot(
      before.priceMicroUsd,
      before.basis,
      before.multiplierWad,
    );
    const beforeKobo = toKobo(beforeShare, before.rate ?? rate);
    const currentKobo = toKobo(sharePrice, rate);
    if (beforeKobo === 0n) return null;
    return Number(((currentKobo - beforeKobo) * 10_000n) / beforeKobo);
  }

  private async listItem(
    stock: Stock,
    onWatchlist: boolean,
    rate: Rate | null,
    at: Date,
  ): Promise<AppStockListItemDto> {
    const profile = profileOf(stock);
    const display = referenceDisplay(stock, at);
    const sharePrice = sharePriceMicroUsd(stock);
    const priceStatus: AppPriceStatus = display ? display.status : "unavailable";
    return {
      ...this.stockRef(stock),
      sector: profile?.sector ?? "Other",
      price_kobo:
        sharePrice !== null && rate !== null ? toKobo(sharePrice, rate).toString() : null,
      price_usd_micro: sharePrice === null ? null : sharePrice.toString(),
      price_status: priceStatus,
      price_as_of: display?.asOf.toISOString() ?? null,
      change_24h_bps: await this.change24hBps(stock, sharePrice, rate, at),
      trading: this.tradingStatus(stock, at),
      on_watchlist: onWatchlist,
      is_test: true,
    };
  }

  async list(
    userId: string,
    q: { query?: string; watchlist?: boolean },
  ): Promise<AppStockListItemDto[]> {
    const at = now();
    let rate: Rate | null = null;
    try {
      rate = (await ratesService.display()).payoutRate;
    } catch {
      rate = null;
    }
    const rows = await db.stock.findMany({
      where: {
        chain: customerChain(),
        enabled: true,
        delisted: false,
        displayTicker: { in: Object.keys(STOCK_PROFILES) },
      },
    });
    let stocks = rows.filter((stock) => this.inCatalog(stock));
    if (q.watchlist) {
      const watched = await db.watchlistEntry.findMany({ where: { userId } });
      const ids = new Set(watched.map((entry) => entry.stockId));
      stocks = stocks.filter((stock) => ids.has(stock.id));
    }
    if (q.query) {
      const needle = q.query.toLowerCase();
      stocks = stocks.filter((stock) => {
        const ticker = (stock.displayTicker ?? stock.symbol).toLowerCase();
        const name = (profileOf(stock)?.name ?? stock.name).toLowerCase();
        return ticker.startsWith(needle) || name.includes(needle);
      });
    }
    stocks.sort((a, b) => {
      const nameA = profileOf(a)?.name ?? a.name;
      const nameB = profileOf(b)?.name ?? b.name;
      return nameA.localeCompare(nameB);
    });
    const watched = new Set(
      (await db.watchlistEntry.findMany({ where: { userId } })).map((entry) => entry.stockId),
    );
    return Promise.all(
      stocks.map((stock) => this.listItem(stock, watched.has(stock.id), rate, at)),
    );
  }

  async get(userId: string, stockId: string): Promise<AppStockDetailDto> {
    const stock = await db.stock.findUnique({ where: { id: stockId } });
    if (!stock) throw new NotFoundException("Stock not found");
    const at = now();
    let rate: Rate | null = null;
    try {
      rate = (await ratesService.display()).payoutRate;
    } catch {
      rate = null;
    }
    if (!this.inCatalog(stock)) {
      // Outside the catalog only visible when the customer holds it.
      const positions = await positionService.list(userId);
      const held = positions.find(
        (p) =>
          p.stock_id === stock.id &&
          (BigInt(p.raw_owned) > 0n || BigInt(p.raw_reserved) > 0n),
      );
      if (!held) throw new NotFoundException("Stock not found");
    }
    const watched = await db.watchlistEntry.findMany({ where: { userId } });
    const item = await this.listItem(stock, watched.some((entry) => entry.stockId === stock.id), rate, at);
    const profile = profileOf(stock);
    const positions = await positionService.list(userId);
    const held = positions.find(
      (p) => p.stock_id === stock.id && (BigInt(p.raw_owned) > 0n || BigInt(p.raw_reserved) > 0n),
    );
    let yourPosition: AppPositionSummaryDto | null = null;
    if (held) {
      const totalRaw = BigInt(held.raw_owned) + BigInt(held.raw_reserved);
      const value = displayValue(stock, totalRaw, rate, at);
      yourPosition = {
        shares_micro: sharesMicroOf(totalRaw, stock.decimals).toString(),
        value_kobo: value.valueKobo === null ? null : value.valueKobo.toString(),
        price_status: value.status,
      };
    }
    return {
      ...item,
      summary: profile?.summary ?? "",
      your_position: yourPosition,
      earn_product_id: await productIdForStock(stock.id),
      documents: ["how-shares-are-held"],
    };
  }

  async chart(stockId: string, range: ChartRange): Promise<AppChartDto> {
    const at = now();
    let rate: Rate | null = null;
    try {
      rate = (await ratesService.display()).payoutRate;
    } catch {
      rate = null;
    }
    const series = await stockHistory.series(stockId, range, at);
    if (series.length < 2 || rate === null) {
      return { range, status: "not_enough_data", points: [], change_bps: null };
    }
    const points = series.map((point) => ({
      t: point.t.toISOString(),
      price_kobo: toKobo(
        sharePriceFromSnapshot(point.priceMicroUsd, point.basis, point.multiplierWad),
        point.rate ?? rate,
      ).toString(),
    }));
    const first = series[0]!;
    const last = series[series.length - 1]!;
    const firstPrice = first.priceMicroUsd;
    const lastPrice = last.priceMicroUsd;
    const changeBps =
      firstPrice === 0n ? null : Number(((lastPrice - firstPrice) * 10_000n) / firstPrice);
    return { range, status: "ok", points, change_bps: changeBps };
  }

  async watch(userId: string, stockId: string): Promise<void> {
    const stock = await db.stock.findUnique({ where: { id: stockId } });
    if (!stock || !this.inCatalog(stock)) throw new NotFoundException("Stock not found");
    await db.watchlistEntry.upsert({
      where: { userId_stockId: { userId, stockId } },
      create: { userId, stockId },
      update: {},
    });
  }

  async unwatch(userId: string, stockId: string): Promise<void> {
    await db.watchlistEntry.deleteMany({ where: { userId, stockId } });
  }
}

export const appCatalogService = new AppCatalogService();
