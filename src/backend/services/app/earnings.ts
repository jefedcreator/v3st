import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { CUSTOMER_DOCUMENTS } from "@/backend/content/documents";
import { EARN_LIMIT_LINES } from "@/backend/content/earn-products";
import { appCatalogService, type AppStockRefDto } from "@/backend/services/app/catalog";
import { toKobo } from "@/backend/services/app/format";
import { nextPayoutDate } from "@/backend/services/app/home";
import { authorizationService } from "@/backend/services/authorizations";
import { earningsService } from "@/backend/services/earnings";
import { lagosWeek } from "@/backend/services/jobs/schedule";
import { ratesService } from "@/backend/services/rates";
import { securityService } from "@/backend/services/security";
import { stockService } from "@/backend/services/stocks";
import { newCuid } from "@/utils";
import { NotFoundException, UnprocessableEntityException } from "@/utils/exceptions";
import type { Rate } from "@/utils/money";
import type { AppEarningsDto } from "@/types/app";

export type { AppEarningsDto } from "@/types/app";

const DAY_MS = 86_400_000;

class AppEarningsService {
  async summary(userId: string): Promise<AppEarningsDto> {
    const at = now();
    let rate: Rate | null = null;
    try {
      rate = (await ratesService.display()).payoutRate;
    } catch {
      rate = null;
    }
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const rows = await db.earning.findMany({ where: { userId } });
    const totalMicro = rows.reduce((sum, e) => sum + BigInt(e.amountUsdc), 0n);
    const totalKobo = rate === null ? "0" : toKobo(totalMicro, rate).toString();

    const weeks = await earningsService.list(userId, { page: 1, size: 100 });
    const currentWeek = lagosWeek(at);
    const thisWeek = weeks.data.find((w) => w.week === currentWeek);
    const thisWeekKobo =
      thisWeek && rate !== null ? toKobo(BigInt(thisWeek.earned_usdc), rate).toString() : "0";

    let reinvestStock: AppStockRefDto | null = null;
    if (user.reinvestStockId) {
      const stock = await stockService.get(user.reinvestStockId).catch(() => null);
      if (stock) reinvestStock = appCatalogService.stockRef(stock);
    }

    const weekDtos = weeks.data.map((week) => {
      let outcome: AppEarningsDto["weeks"][number]["outcome"];
      let detail: string;
      if (week.status === "paid") {
        outcome = "paid";
        detail = "Paid to your bank";
      } else if (week.status === "reinvested") {
        outcome = "reinvested";
        detail = `Reinvested in ${reinvestStock?.name ?? "your chosen stock"}`;
      } else if (week.status === "mixed") {
        outcome = "mixed";
        detail = "Partly paid, partly reinvested";
      } else if (week.week === currentWeek) {
        outcome = "pending";
        detail = "Pays out on Friday";
      } else {
        outcome = "rolled_over";
        detail = "Below ₦2,000, so it rolls over";
      }
      return {
        week_of: week.week,
        earned_kobo: rate === null ? "0" : toKobo(BigInt(week.earned_usdc), rate).toString(),
        outcome,
        detail,
      };
    });

    return {
      total_earned_kobo: totalKobo,
      this_week_kobo: thisWeekKobo,
      choice: user.earningsMode,
      reinvest_stock: reinvestStock,
      next_payout_on: nextPayoutDate(at),
      minimum_payout_kobo: policy.earnings.minPayoutKobo.toString(),
      limits: [...EARN_LIMIT_LINES],
      weeks: weekDtos,
    };
  }

  async setPreference(
    userId: string,
    input: { choice: "payout" | "reinvest"; stockId: string | null; pin: string },
  ): Promise<AppEarningsDto> {
    await securityService.verifyPin(userId, input.pin);
    let reinvestStockId: string | null = null;
    if (input.choice === "reinvest") {
      if (!input.stockId) {
        throw new UnprocessableEntityException("Reinvest needs a stock", "STOCK_UNAVAILABLE");
      }
      // Reinvest only into a stock the customer can see in the catalog.
      const stock = await db.stock.findUnique({ where: { id: input.stockId } });
      if (!stock || !appCatalogService.inCatalog(stock)) {
        throw new NotFoundException("Stock not found");
      }
      reinvestStockId = stock.id;
    }
    const defaults = policy.app.earnings;
    await earningsService.setPreference(userId, {
      mode: input.choice,
      stock_id: reinvestStockId ?? undefined,
      consent_version: defaults.consentVersion,
      allow_background_conversion: defaults.allowBackgroundConversion,
      max_conversion_fee_bps: defaults.maxConversionFeeBps,
      max_fx_bps: defaults.maxFxBps,
    });
    // Any earlier reinvest consent ends here, whichever stock it was for; a
    // reinvest choice then gets exactly one fresh standing consent.
    const earlier = await db.investmentAuthorization.findMany({
      where: { userId, kind: "standing", revokedAt: null, actions: { has: "reinvest" } },
    });
    for (const consent of earlier) {
      await authorizationService.revoke(userId, consent.id);
    }
    if (reinvestStockId !== null) {
      const automation = policy.app.earn.automation;
      await authorizationService.create(
        userId,
        {
          kind: "standing",
          stock_ids: [reinvestStockId],
          strategy_ids: [],
          actions: ["reinvest"],
          max_action_ngn: automation.perActionCapKobo,
          max_total_ngn: automation.totalCapKobo,
          max_fee_bps: policy.app.orders.consent.maxFeeBps,
          max_slippage_bps: policy.app.orders.consent.maxSlippageBps,
          expires_at: new Date(now().getTime() + automation.expiryDays * DAY_MS).toISOString(),
          policy_version: policy.app.policyVersion,
          disclosure_version: CUSTOMER_DOCUMENTS["earn-risks"].version,
        },
        // Unique per choice: re-choosing the same stock after a revoke must not
        // collide with the earlier consent's key.
        `app-reinvest:${userId}:${reinvestStockId}:${newCuid()}`,
      );
    }
    return this.summary(userId);
  }
}

export const appEarningsService = new AppEarningsService();
