import type { Stock } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { PUBLIC_TICKERS, STOCK_PROFILES } from "@/backend/content/stock-profiles";
import type { PublicTickerDto, PublicTickerRow } from "@/types/landing";
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
import { NotFoundException } from "@/utils/exceptions";
import type { Rate } from "@/utils/money";

import { sharesMicroOf, toKobo } from "./format";
import type { AppTrading, AppPriceStatus, AppStockRefDto, AppStockListItemDto, AppPositionSummaryDto, AppStockDetailDto, AppChartDto } from "@/types/app";

export type { AppTrading, AppPriceStatus, AppStockRefDto, AppStockListItemDto, AppPositionSummaryDto, AppStockDetailDto, AppChartDto } from "@/types/app";

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

  private async priceFields(
    stock: Stock,
    rate: Rate | null,
    at: Date,
  ): Promise<
    Pick<AppStockListItemDto, "price_kobo" | "price_status" | "price_as_of" | "change_24h_bps">
  > {
    const display = referenceDisplay(stock, at);
    // A price older than the display window is unknown to the customer: no
    // number is shown, only "unavailable".
    const sharePrice = display ? sharePriceMicroUsd(stock) : null;
    const priceStatus: AppPriceStatus = display ? display.status : "unavailable";
    return {
      price_kobo:
        sharePrice !== null && rate !== null ? toKobo(sharePrice, rate).toString() : null,
      price_status: priceStatus,
      price_as_of: display?.asOf.toISOString() ?? null,
      change_24h_bps: await this.change24hBps(stock, sharePrice, rate, at),
    };
  }

  private async listItem(
    stock: Stock,
    onWatchlist: boolean,
    rate: Rate | null,
    at: Date,
  ): Promise<AppStockListItemDto> {
    const profile = profileOf(stock);
    const display = referenceDisplay(stock, at);
    const sharePrice = display ? sharePriceMicroUsd(stock) : null;
    return {
      ...this.stockRef(stock),
      sector: profile?.sector ?? "Other",
      ...(await this.priceFields(stock, rate, at)),
      price_usd_micro: sharePrice === null ? null : sharePrice.toString(),
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

  // The landing page's read-only beta ticker: one row per profiled ticker that
  // carries a logo, in profile order, never test fixtures. A stock missing from
  // the catalog keeps its row with null prices rather than being dropped.
  async publicTicker(at: Date = now()): Promise<PublicTickerDto> {
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
    const byTicker = new Map(
      rows.filter((stock) => this.inCatalog(stock)).map((stock) => [stock.displayTicker!, stock]),
    );
    const out: PublicTickerRow[] = [];
    for (const ticker of PUBLIC_TICKERS) {
      const profile = STOCK_PROFILES[ticker]!;
      const stock = byTicker.get(ticker);
      let price_kobo: string | null = null;
      let price_status: AppPriceStatus = "unavailable";
      let price_as_of: string | null = null;
      let change_24h_bps: number | null = null;
      let line_kobo: string[] = [];
      if (stock) {
        const fields = await this.priceFields(stock, rate, at);
        price_kobo = fields.price_kobo;
        price_status = fields.price_status;
        price_as_of = fields.price_as_of;
        change_24h_bps = fields.change_24h_bps;
        const chart = await this.chart(stock.id, "1D");
        if (chart.status === "ok") line_kobo = chart.points.map((point) => point.price_kobo);
      }
      out.push({
        ticker,
        name: profile.name,
        sector: profile.sector,
        logo_path: profile.logoPath ?? "",
        price_kobo,
        price_status,
        price_is_estimate: profile.estimatedPrice,
        price_as_of,
        change_24h_bps,
        line_kobo,
      });
    }
    const asOfValues = out
      .map((row) => row.price_as_of)
      .filter((value): value is string => value !== null)
      .sort();
    return { rows: out, as_of: asOfValues.at(-1) ?? null };
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
      earn_product_id: await this.earnProductIdFor(stock.id),
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
    // The change is measured on the naira points the customer sees.
    const firstKobo = BigInt(points[0]!.price_kobo);
    const lastKobo = BigInt(points[points.length - 1]!.price_kobo);
    const changeBps =
      firstKobo === 0n ? null : Number(((lastKobo - firstKobo) * 10_000n) / firstKobo);
    return { range, status: "ok", points, change_bps: changeBps };
  }

  // Loaded lazily: the Earn service builds on this catalog, so a static import
  // here would make the two modules depend on each other at load time.
  private async earnProductIdFor(stockId: string): Promise<string | null> {
    const { appEarnService } = await import("@/backend/services/app/earn");
    return appEarnService.productIdForStock(stockId);
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
