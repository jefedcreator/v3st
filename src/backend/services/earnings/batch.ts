import { Prisma } from "@/server/prisma";
import { db, withTx } from "@/server/db";
import { policy } from "@/backend/config/policy";
import { alertService } from "@/backend/services/alerts";
import { bankAccountService } from "@/backend/services/bank-accounts";
import { complianceService } from "@/backend/services/compliance";
import { controlsService } from "@/backend/services/controls";
import { ProviderError } from "@/backend/services/ramp/errors";
import { rampRegistry } from "@/backend/services/ramp";
import { ratesService } from "@/backend/services/rates";
import { capacityService } from "@/backend/services/treasury/capacity";
import { treasuryService } from "@/backend/services/treasury";
import { tradeService } from "@/backend/services/trades";
import { withdrawalService } from "@/backend/services/withdrawals";
import { HttpException } from "@/utils/exceptions";
import { ngnToUsd, usdToNgn } from "@/utils/money";

export type BatchResult = {
  paid: number;
  reinvested: number;
  rolledOver: number;
  skipped: Record<"needs_choice" | "kyc" | "bank_account" | "limit" | "paused", number>;
  stoppedForFloat: boolean;
};

function emptySkipped(): BatchResult["skipped"] {
  return { needs_choice: 0, kyc: 0, bank_account: 0, limit: 0, paused: 0 };
}

class EarningsBatchService {
  private async candidates(week: string) {
    const rows = await db.earning.findMany({
      where: {
        payoutOrderId: null,
        reinvestTradeId: null,
        week: { lte: week },
      },
      orderBy: [{ harvestedAt: "asc" }, { userId: "asc" }],
    });
    const byUser = new Map<string, { userId: string; total: bigint; earningIds: string[]; firstHarvestedAt: Date }>();
    for (const row of rows) {
      const entry = byUser.get(row.userId) ?? {
        userId: row.userId,
        total: 0n,
        earningIds: [],
        firstHarvestedAt: row.harvestedAt,
      };
      entry.total += row.amountUsdc;
      entry.earningIds.push(row.id);
      if (row.harvestedAt < entry.firstHarvestedAt) entry.firstHarvestedAt = row.harvestedAt;
      byUser.set(row.userId, entry);
    }
    return [...byUser.values()].sort((a, b) =>
      a.firstHarvestedAt.getTime() === b.firstHarvestedAt.getTime()
        ? a.userId < b.userId
          ? -1
          : 1
        : a.firstHarvestedAt.getTime() - b.firstHarvestedAt.getTime(),
    );
  }

  async precheck(week: string): Promise<{ requiredUsd: bigint; floatAvailable: bigint }> {
    const candidates = await this.candidates(week);
    const display = await ratesService.display();
    let requiredUsd = 0n;
    for (const candidate of candidates) {
      const user = await db.user.findUniqueOrThrow({ where: { id: candidate.userId } });
      if (user.earningsMode !== "payout") continue;
      const gross = usdToNgn(candidate.total, display.payoutRate, "floor");
      if (gross < policy.earnings.minPayoutKobo) continue;
      requiredUsd += ngnToUsd(gross, display.payoutRate, "ceil");
    }
    const floatAvailable = await capacityService.floatAvailable("yellowcard");
    if (requiredUsd > 0n) {
      await treasuryService.ensureFloat("yellowcard", requiredUsd);
    }
    return { requiredUsd, floatAvailable };
  }

  async runBatch(week: string, at: Date): Promise<BatchResult> {
    const result: BatchResult = {
      paid: 0,
      reinvested: 0,
      rolledOver: 0,
      skipped: emptySkipped(),
      stoppedForFloat: false,
    };
    if (await controlsService.isPaused("payouts")) {
      const candidates = await this.candidates(week);
      result.skipped.paused = candidates.length;
      return result;
    }
    const display = await ratesService.display();
    const provider = await rampRegistry.selectForNewOrder("out");
    const candidates = await this.candidates(week);
    for (const candidate of candidates) {
      const user = await db.user.findUniqueOrThrow({ where: { id: candidate.userId } });
      if (user.earningsMode === "unset") {
        result.skipped.needs_choice += 1;
        continue;
      }
      if (user.earningsMode === "reinvest") {
        const stockId = user.reinvestStockId;
        if (!stockId) {
          result.skipped.needs_choice += 1;
          continue;
        }
        try {
          await withTx(async (tx) => {
            const trade = await tradeService.createBuy(tx, {
              key: `reinvest:${user.id}:${week}`,
              userId: user.id,
              stockId,
              amountIn: candidate.total,
              purpose: "reinvest",
              fundsSource: "earnings",
            });
            await tx.earning.updateMany({
              where: { id: { in: candidate.earningIds } },
              data: { reinvestTradeId: trade.id },
            });
          });
          result.reinvested += 1;
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            continue;
          }
          throw error;
        }
        continue;
      }
      const bank = await bankAccountService.getActiveRow(user.id);
      if (user.kycStatus !== "verified") {
        result.skipped.kyc += 1;
        continue;
      }
      if (!bank) {
        result.skipped.bank_account += 1;
        continue;
      }
      const gross = usdToNgn(candidate.total, display.payoutRate, "floor");
      if (gross < policy.earnings.minPayoutKobo) {
        result.rolledOver += 1;
        continue;
      }
      let quote;
      try {
        quote = await provider.quote("out", gross);
      } catch (error) {
        if (error instanceof ProviderError) {
          result.skipped.limit += 1;
          continue;
        }
        throw error;
      }
      const available = await capacityService.floatAvailable(provider.id);
      if (available < quote.usdAmount) {
        result.stoppedForFloat = true;
        await alertService.raise(db, {
          kind: "float.short",
          severity: "critical",
          dedupeKey: `float.short:friday:${week}`,
          message: `Float short for Friday batch ${week}`,
          context: { week, required: quote.usdAmount.toString(), available: available.toString() },
        });
        break;
      }
      try {
        await withTx(async (tx) => {
          await complianceService.assertCanTransact(tx, {
            userId: user.id,
            direction: "out",
            ngnAmount: gross,
            usdAmount: ngnToUsd(gross, quote.rate, "ceil"),
            at,
          });
          await withdrawalService.createEarningsPayout(tx, {
            userId: user.id,
            week,
            earningIds: candidate.earningIds,
            amountUsdc: candidate.total,
            quote,
          });
        });
        result.paid += 1;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          continue;
        }
        if (error instanceof HttpException) {
          if (error.code === "KYC_REQUIRED") result.skipped.kyc += 1;
          else result.skipped.limit += 1;
          continue;
        }
        throw error;
      }
    }
    return result;
  }
}

export const earningsBatchService = new EarningsBatchService();
