import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { sharePriceFromSnapshot } from "@/backend/services/app/catalog";
import type { AppCashDto } from "@/backend/services/app/cash";
import { appCashService } from "@/backend/services/app/cash";
import { firstNameOf, formatNaira, toKobo } from "@/backend/services/app/format";
import type { AppHoldingDto } from "@/backend/services/app/holdings";
import { appHoldingsService } from "@/backend/services/app/holdings";
import { appOnboardingService } from "@/backend/services/app/onboarding";
import { appOrdersService, type AppOrderDto } from "@/backend/services/app/orders";
import { bankAccountService } from "@/backend/services/bank-accounts";
import { earningsService } from "@/backend/services/earnings";
import { lagosDayStart, lagosParts, lagosWeek } from "@/backend/services/jobs/schedule";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { ratesService } from "@/backend/services/rates";
import { strategyService } from "@/backend/services/strategies";
import { stockHistory } from "@/backend/services/stocks/history";
import { APP_BETA_NOTICE, type AppBetaDto } from "@/types/app";
import type { Rate } from "@/utils/money";

export type AppActionItemDto = {
  kind: "finish_setup" | "finish_transfer" | "choose_earnings" | "add_bank_account" | "renew_automation";
  title: string;
  detail: string;
  link: string;
};

export type AppHomeDto = {
  greeting_name: string | null;
  total_kobo: string | null;
  total_status: "ok" | "partial" | "unavailable";
  as_of: string;
  change_24h_kobo: string | null;
  cash: AppCashDto;
  invested_kobo: string | null;
  earn_kobo: string | null;
  earnings: { this_week_kobo: string | null; next_payout_on: string; choice: "payout" | "reinvest" | "unset" };
  holdings: AppHoldingDto[];
  open_orders: AppOrderDto[];
  action_items: AppActionItemDto[];
  beta: AppBetaDto;
};

// The next Friday in Lagos (the weekly payout day), as YYYY-MM-DD.
function nextPayoutDate(at: Date): string {
  const payoutWeekday = policy.schedule.payouts.weekday;
  const parts = lagosParts(at);
  const dayStart = lagosDayStart(at).getTime();
  let friday = dayStart - (parts.weekday - 1) * 86_400_000 + (payoutWeekday - 1) * 86_400_000;
  if (lagosParts(new Date(friday)).isoDate < parts.isoDate) {
    friday += 7 * 86_400_000;
  }
  return lagosParts(new Date(friday)).isoDate;
}

class AppHomeService {
  async get(userId: string): Promise<AppHomeDto> {
    const at = now();
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    let rate: Rate | null = null;
    try {
      rate = (await ratesService.display()).payoutRate;
    } catch {
      rate = null;
    }

    const cash = await appCashService.balance(userId);
    const holdings = await appHoldingsService.list(userId);

    let investedKobo = 0n;
    let anyHoldingUnpriced = false;
    for (const holding of holdings) {
      if (holding.value_kobo === null) {
        anyHoldingUnpriced = true;
      } else {
        investedKobo += BigInt(holding.value_kobo);
      }
    }

    const strategyPositions = await strategyService.positions(userId);
    const activePositions = strategyPositions.filter((p) => p.state === "active");
    let earnMicro = 0n;
    let anyPositionUnvalued = false;
    for (const position of activePositions) {
      if (position.value_usdc === null) {
        anyPositionUnvalued = true;
      } else {
        earnMicro += BigInt(position.value_usdc);
      }
    }
    const earnKobo = rate === null ? null : toKobo(earnMicro, rate).toString();

    const parts: bigint[] = [];
    let anyPartNull = false;
    const cashParts = [cash.available_kobo, cash.on_hold_kobo];
    for (const part of cashParts) {
      if (part === null) anyPartNull = true;
      else parts.push(BigInt(part));
    }
    parts.push(investedKobo);
    if (anyHoldingUnpriced) anyPartNull = true;
    if (earnKobo === null) {
      anyPartNull = true;
    } else {
      parts.push(BigInt(earnKobo));
    }
    if (anyPositionUnvalued) anyPartNull = true;
    const totalKobo = rate === null ? null : parts.reduce((a, b) => a + b, 0n).toString();
    const totalStatus: AppHomeDto["total_status"] =
      rate === null ? "unavailable" : anyPartNull ? "partial" : "ok";

    // 24-hour change across current holdings: value now minus value at the
    // price 24 hours ago; null when any side is missing.
    let change24h: bigint | null = 0n;
    if (rate !== null) {
      const balances = await ledgerService.balancesForUser(userId);
      for (const holding of holdings) {
        const stock = await db.stock.findUniqueOrThrow({ where: { id: holding.id } });
        const totalRaw =
          (balances.get(acct.userStock(userId, stock.id).code) ?? 0n) +
          (balances.get(acct.userStockReserved(userId, stock.id).code) ?? 0n);
        const before = await stockHistory.priceBefore(
          stock.id,
          new Date(at.getTime() - 86_400_000),
        );
        if (!before || holding.value_kobo === null) {
          change24h = null;
          break;
        }
        const beforeShare = sharePriceFromSnapshot(
          before.priceMicroUsd,
          before.basis,
          before.multiplierWad,
        );
        const beforeValueMicro = (totalRaw * beforeShare) / 10n ** BigInt(stock.decimals);
        const beforeKobo = toKobo(beforeValueMicro, before.rate ?? rate);
        change24h = change24h + (BigInt(holding.value_kobo) - beforeKobo);
      }
    } else {
      change24h = null;
    }

    const weeks = await earningsService.list(userId, { page: 1, size: 100 });
    const thisWeek = weeks.data.find((w) => w.week === lagosWeek(at));
    const thisWeekKobo =
      thisWeek && rate !== null ? toKobo(BigInt(thisWeek.earned_usdc), rate).toString() : null;

    const openOrderRows = await db.customerOrder.findMany({
      where: {
        userId,
        status: { in: ["waiting_for_payment", "waiting_for_price", "executing"] },
      },
      orderBy: { createdAt: "desc" },
    });
    const openOrders = await Promise.all(
      openOrderRows.map((order) => appOrdersService.get(userId, order.id)),
    );

    const onboarding = await appOnboardingService.status(userId);
    const bankAccount = await bankAccountService.getActiveRow(userId);
    const actionItems: AppActionItemDto[] = [];
    if (!onboarding.complete) {
      const left = onboarding.steps.filter((step) => !step.done).length;
      actionItems.push({
        kind: "finish_setup",
        title: "Finish setting up",
        detail: `${left} ${left === 1 ? "step" : "steps"} left`,
        link: "/setup",
      });
    }
    for (const order of openOrders) {
      if (order.status === "waiting_for_payment") {
        actionItems.push({
          kind: "finish_transfer",
          title: "Finish your transfer",
          detail: `Send ${formatNaira(BigInt(order.amount_kobo ?? "0"))} to buy ${order.stock.name}.`,
          link: `/orders/${order.id}`,
        });
      }
    }
    if (thisWeekKobo !== null && BigInt(thisWeekKobo) > 0n && user.earningsMode === "unset") {
      actionItems.push({
        kind: "choose_earnings",
        title: "Choose what happens to your earnings",
        detail: "Get paid on Fridays or reinvest.",
        link: "/earnings",
      });
    }
    if (
      !bankAccount &&
      cash.available_kobo !== null &&
      BigInt(cash.available_kobo) >= 200_000n
    ) {
      actionItems.push({
        kind: "add_bank_account",
        title: "Add your bank account",
        detail: "So you can withdraw your money.",
        link: "/settings/bank",
      });
    }

    return {
      greeting_name: firstNameOf(user.verifiedName),
      total_kobo: totalKobo,
      total_status: totalStatus,
      as_of: at.toISOString(),
      change_24h_kobo: change24h === null ? null : change24h.toString(),
      cash,
      invested_kobo: investedKobo.toString(),
      earn_kobo: earnKobo,
      earnings: {
        this_week_kobo: thisWeekKobo,
        next_payout_on: nextPayoutDate(at),
        choice: user.earningsMode,
      },
      holdings: holdings.slice(0, 5),
      open_orders: openOrders,
      action_items: actionItems,
      beta: { test_money: true, notice: APP_BETA_NOTICE },
    };
  }
}

export const appHomeService = new AppHomeService();
