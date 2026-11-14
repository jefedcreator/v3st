import { Prisma } from "@/server/prisma";
import { db, withTx } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { cashReleased, earningHarvested } from "@/backend/services/ledger/postings";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { ProviderError } from "@/backend/services/ramp/errors";
import { rampRegistry } from "@/backend/services/ramp";
import { ratesService } from "@/backend/services/rates";
import { stockService } from "@/backend/services/stocks";
import type { PaginationQuerySchema } from "@/backend/validators/index.validator";
import type { EarningsPreferenceDto, EarningsWeekDto } from "@/types/dto";
import { UnprocessableEntityException } from "@/utils/exceptions";
import { formatMinor, usdToNgn } from "@/utils/money";
import { fromDbRaw } from "@/utils/asset-units";

import { simulatedEarningsSource } from "./source";

class EarningsService {
  async harvest(week: string): Promise<{ recorded: number }> {
    const source = simulatedEarningsSource;
    const accounts = await db.$queryRaw<Array<{ code: string; userId: string; asset: string }>>`
      SELECT code, "userId", asset FROM "ledger_accounts"
      WHERE "ownerType" = 'user' AND asset LIKE 'STOCK:%'
    `;
    let recorded = 0;
    for (const account of accounts) {
      if (account.code.endsWith(":reserved")) continue;
      const match = /^user:(.+):stock:(.+)$/.exec(account.code);
      if (!match) continue;
      const userId = match[1]!;
      const stockId = match[2]!;
      const stock = await db.stock.findUnique({ where: { id: stockId } });
      if (!stock?.enabled) continue;
      const quantity = await ledgerService.balance(acct.userStock(userId, stockId));
      if (quantity <= 0n) continue;
      const amount = await source.harvest({ userId, stock, quantity, week });
      if (amount <= 0n) continue;
      await withTx(async (tx) => {
        try {
          await tx.earning.create({
            data: {
              userId,
              stockId,
              week,
              chain: stock.chain,
              amountUsdc: amount,
              harvestedAt: now(),
            },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            return;
          }
          throw error;
        }
        await ledgerService.post(
          tx,
          earningHarvested({ userId, stockId, week, chain: stock.chain, amount }),
        );
        recorded += 1;
      });
    }
    return { recorded };
  }

  async list(
    userId: string,
    query: PaginationQuerySchema,
  ): Promise<{ data: EarningsWeekDto[]; total: number; page: number; size: number }> {
    const rows = await db.earning.findMany({
      where: { userId },
      orderBy: [{ week: "desc" }, { harvestedAt: "asc" }],
    });
    let ngnRate: Awaited<ReturnType<typeof ratesService.display>> | null = null;
    try {
      ngnRate = await ratesService.display();
    } catch {
      ngnRate = null;
    }
    const byWeek = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byWeek.get(row.week) ?? [];
      list.push(row);
      byWeek.set(row.week, list);
    }
    const weeks: EarningsWeekDto[] = [];
    for (const [week, list] of byWeek) {
      let earned = 0n;
      let paid = 0n;
      let reinvested = 0n;
      for (const row of list) {
        earned += row.amountUsdc;
        if (row.payoutOrderId) paid += row.amountUsdc;
        if (row.reinvestTradeId) reinvested += row.amountUsdc;
      }
      const pending = earned - paid - reinvested;
      const status =
        paid > 0n && reinvested > 0n
          ? "mixed"
          : paid === earned
            ? "paid"
            : reinvested === earned
              ? "reinvested"
              : "pending";
      weeks.push({
        week,
        earned_usdc: formatMinor(earned),
        paid_usdc: formatMinor(paid),
        reinvested_usdc: formatMinor(reinvested),
        pending_usdc: formatMinor(pending),
        ngn_value: ngnRate ? formatMinor(usdToNgn(earned, ngnRate.payoutRate, "floor")) : null,
        status,
      });
    }
    weeks.sort((a, b) => (a.week < b.week ? 1 : -1));
    const total = weeks.length;
    const start = (query.page - 1) * query.size;
    return { data: weeks.slice(start, start + query.size), total, page: query.page, size: query.size };
  }

  async setPreference(
    userId: string,
    body: { mode: "payout" | "reinvest"; stock_id?: string },
  ): Promise<EarningsPreferenceDto> {
    let stockId: string | null = null;
    if (body.mode === "reinvest") {
      if (!body.stock_id) {
        throw new UnprocessableEntityException(
          "reinvest requires an enabled stock_id",
          "STOCK_UNAVAILABLE",
        );
      }
      const stock = await stockService.get(body.stock_id);
      stockId = stock.id;
    } else if (body.stock_id) {
      throw new UnprocessableEntityException(
        "payout cannot choose a stock",
        "VALIDATION_FAILED",
      );
    }
    await db.user.update({
      where: { id: userId },
      data: { earningsMode: body.mode, reinvestStockId: stockId },
    });
    let payoutFee: string | null = null;
    try {
      const provider = await rampRegistry.selectForNewOrder("out");
      const quote = await provider.quote("out", policy.earnings.minPayoutKobo);
      payoutFee = quote.feeNgn.toString();
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error;
      payoutFee = null;
    }
    return {
      mode: body.mode,
      stock_id: stockId,
      minimum_payout_ngn: policy.earnings.minPayoutKobo.toString(),
      payout_fee_ngn: payoutFee,
    };
  }

  async onReinvestSettled(tradeId: string, failed: boolean, key: string, userId: string, chain: string): Promise<void> {
    if (!failed) return;
    await withTx(async (tx) => {
      await ledgerService.post(
        tx,
        cashReleased({
          key,
          userId,
          chain,
          amount: fromDbRaw((await tx.tradeOrder.findUniqueOrThrow({ where: { id: tradeId } })).amountIn),
          to: "earnings",
        }),
      );
      await tx.earning.updateMany({
        where: { reinvestTradeId: tradeId },
        data: { reinvestTradeId: null },
      });
    });
  }
}

export const earningsService = new EarningsService();
