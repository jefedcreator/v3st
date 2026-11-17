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
import { UnprocessableEntityException } from "@/utils/exceptions";
import type { Rate } from "@/utils/money";

export type AppEarningsDto = {
  total_earned_kobo: string;
  this_week_kobo: string;
  choice: "payout" | "reinvest" | "unset";
  reinvest_stock: AppStockRefDto | null;
  next_payout_on: string;
  minimum_payout_kobo: string;
  limits: string[];
  weeks: {
    week_of: string;
    earned_kobo: string;
    outcome: "pending" | "paid" | "reinvested" | "rolled_over" | "mixed";
    detail: string;
  }[];
};

const REINVEST_CAPS = {
  max_action_ngn: 50_000_000n,
  max_total_ngn: 2_000_000_000n,
  max_fee_bps: 100,
  max_slippage_bps: 100,
  ttlMs: 30 * 86_400_000,
};

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
    if (input.choice === "reinvest") {
      if (!input.stockId) {
        throw new UnprocessableEntityException("Reinvest needs a stock", "STOCK_UNAVAILABLE");
      }
      await stockService.get(input.stockId);
    }
    await earningsService.setPreference(userId, {
      mode: input.choice,
      stock_id: input.choice === "reinvest" ? input.stockId ?? undefined : undefined,
      consent_version: policy.app.policyVersion,
      allow_background_conversion: true,
      max_conversion_fee_bps: 100,
      max_fx_bps: 200,
    });
    if (input.choice === "reinvest" && input.stockId) {
      // Revoke any earlier reinvest consent, then create the standing one.
      const previous = await authorizationService.findStanding(userId, "reinvest", {
        stockId: input.stockId,
      });
      if (previous) {
        await authorizationService.revoke(userId, previous.id);
      }
      await authorizationService.create(
        userId,
        {
          kind: "standing",
          stock_ids: [input.stockId],
          strategy_ids: [],
          actions: ["reinvest"],
          max_action_ngn: REINVEST_CAPS.max_action_ngn,
          max_total_ngn: REINVEST_CAPS.max_total_ngn,
          max_fee_bps: REINVEST_CAPS.max_fee_bps,
          max_slippage_bps: REINVEST_CAPS.max_slippage_bps,
          expires_at: new Date(now().getTime() + REINVEST_CAPS.ttlMs).toISOString(),
          policy_version: policy.app.policyVersion,
          disclosure_version: CUSTOMER_DOCUMENTS["earn-risks"].version,
        },
        `reinvest-consent:${userId}:${input.stockId}`,
      );
    }
    return this.summary(userId);
  }
}

export const appEarningsService = new AppEarningsService();
