import { db } from "@/server/db";
import { now } from "@/backend/clock";
import {
  appCatalogService,
  type AppPriceStatus,
  type AppStockRefDto,
  type AppTrading,
} from "@/backend/services/app/catalog";
import { displayValue } from "@/backend/services/app/valuation";
import { customerChain } from "@/backend/services/app/network";
import { sharesMicroOf } from "@/backend/services/app/format";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { positionService } from "@/backend/services/positions";
import { ratesService } from "@/backend/services/rates";
import { referenceUsable } from "@/backend/services/stocks/reference";
import type { Rate } from "@/utils/money";

export type AppHoldingDto = AppStockRefDto & {
  shares_micro: string;
  on_hold_shares_micro: string;
  value_kobo: string | null;
  price_status: AppPriceStatus;
  price_as_of: string | null;
  cost_kobo: string | null;
  return_kobo: string | null;
  return_bps: number | null;
  trading: AppTrading;
};

class AppHoldingsService {
  async list(userId: string): Promise<AppHoldingDto[]> {
    const at = now();
    let rate: Rate | null = null;
    try {
      rate = (await ratesService.display()).payoutRate;
    } catch {
      rate = null;
    }
    const balances = await ledgerService.balancesForUser(userId);
    const stocks = await db.stock.findMany({ where: { chain: customerChain() } });
    const holdings: AppHoldingDto[] = [];
    for (const stock of stocks) {
      const owned = balances.get(acct.userStock(userId, stock.id).code) ?? 0n;
      const reserved = balances.get(acct.userStockReserved(userId, stock.id).code) ?? 0n;
      const totalRaw = owned + reserved;
      if (totalRaw <= 0n) continue;
      const value = displayValue(stock, totalRaw, rate, at);
      const costKobo = await positionService.costKobo(userId, stock.id);
      const returnKobo =
        value.valueKobo !== null && costKobo !== null ? value.valueKobo - costKobo : null;
      const returnBps =
        returnKobo !== null && costKobo !== null && costKobo > 0n
          ? Number((returnKobo * 10_000n) / costKobo)
          : null;
      holdings.push({
        ...appCatalogService.stockRef(stock),
        shares_micro: sharesMicroOf(totalRaw, stock.decimals).toString(),
        on_hold_shares_micro: sharesMicroOf(reserved, stock.decimals).toString(),
        value_kobo: value.valueKobo === null ? null : value.valueKobo.toString(),
        price_status: value.status,
        price_as_of: value.asOf ? value.asOf.toISOString() : null,
        cost_kobo: costKobo === null ? null : costKobo.toString(),
        return_kobo: returnKobo === null ? null : returnKobo.toString(),
        return_bps: returnBps,
        trading:
          stock.paused || stock.delisted
            ? "paused"
            : referenceUsable(stock, at)
              ? "available"
              : "prices_updating",
      });
    }
    holdings.sort((a, b) => {
      const aValue = a.value_kobo === null ? -1n : BigInt(a.value_kobo);
      const bValue = b.value_kobo === null ? -1n : BigInt(b.value_kobo);
      if (aValue !== bValue) return aValue > bValue ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return holdings;
  }
}

export const appHoldingsService = new AppHoldingsService();
