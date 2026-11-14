import { Prisma } from "@/server/prisma";
import { db, withTx } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { cashReleased, conversionProceedsRecognized } from "@/backend/services/ledger/postings";
import { ledgerService } from "@/backend/services/ledger";
import { lagosWeek } from "@/backend/services/jobs/schedule";
import { ProviderError } from "@/backend/services/ramp/errors";
import { rampRegistry } from "@/backend/services/ramp";
import { ratesService } from "@/backend/services/rates";
import { stockService } from "@/backend/services/stocks";
import { strategyService } from "@/backend/services/strategies";
import { unpack } from "@/backend/services/execution";
import type { AssetAmount } from "@/backend/services/onchain/types";
import { userIdForBeneficiary } from "@/backend/services/rewards";
import type { PaginationQuerySchema } from "@/backend/validators/index.validator";
import type { EarningsPreferenceDto, EarningsWeekDto } from "@/types/dto";
import { NotFoundException, UnprocessableEntityException } from "@/utils/exceptions";
import { formatMinor, usdToNgn } from "@/utils/money";
import { fromDbRaw, toDbRaw } from "@/utils/asset-units";

class EarningsService {
  // Harvest no longer computes yield from current holdings. It schedules the
  // verified source actions (separate fee/distribution claims) for active
  // strategy positions whose authorization is still valid; the resulting
  // receipts are recorded on finalization. Static stock and idle cash pay zero.
  async harvest(week: string): Promise<{ recorded: number }> {
    let recorded = 0;
    const positions = await db.strategyPosition.findMany({ where: { state: "active" } });
    for (const position of positions) {
      const strategy = await db.strategy.findUnique({ where: { id: position.strategyId } });
      // Embedded-fee strategies realize on exit only; there is no claim to schedule.
      if (!strategy?.separateClaim) continue;
      if (!position.operationId) continue;
      const entryOp = await db.onchainOperation.findUnique({ where: { id: position.operationId } });
      const authorizationId = entryOp?.authorizationId;
      if (!authorizationId) continue;
      const key = `harvest:${position.id}:${week}`;
      if (await db.onchainOperation.findUnique({ where: { key: `strat-op:${key}` } })) continue;
      try {
        const quote = await strategyService.quote(position.userId, {
          positionId: position.id,
          action: "claim",
        });
        await strategyService.confirm(position.userId, quote.id, authorizationId, key);
        recorded += 1;
      } catch {
        // A revoked/expired authorization or an unavailable claim pauses new
        // actions; accepted and broadcast work is preserved for reconciliation.
      }
    }
    return { recorded };
  }

  // Records finalized settlement proceeds of a receipt exactly once: settlement
  // receipts are already credited, stock receipts need their conversion sell to
  // have finalized. Creates the earning + allocation and marks the receipt
  // available. An unconverted reward asset is never payable.
  async recognize(receiptId: string): Promise<void> {
    await withTx(async (tx) => {
      const receipt = await tx.rewardReceipt.findUniqueOrThrow({ where: { id: receiptId } });
      if (receipt.state !== "received_asset" && receipt.state !== "conversion_pending") return;
      if (await tx.earning.findUnique({ where: { receiptId } })) return;
      const userId = await userIdForBeneficiary(tx, receipt.beneficiary);
      if (!userId) throw new NotFoundException("Receipt beneficiary unknown", "NOT_FOUND");
      const stock = await tx.stock.findFirst({ where: { assetKey: receipt.asset } });
      const chain = stock?.chain ?? policy.onchain.networkNamespace;
      let amountUsdc = fromDbRaw(receipt.amountRaw);
      if (stock) {
        const opId = receipt.conversionOperationId;
        if (!opId) return;
        const op = await tx.onchainOperation.findUnique({ where: { id: opId } });
        if (op?.status !== "finalized") return;
        const actual = unpack(op.actual) as { output?: AssetAmount };
        amountUsdc = actual.output?.raw ?? 0n;
        if (amountUsdc <= 0n) return;
        await ledgerService.post(
          tx,
          conversionProceedsRecognized({ key: `recognize:${receiptId}`, userId, chain, amount: amountUsdc }),
        );
      }
      const week = receipt.week ?? lagosWeek(now());
      try {
        await tx.earning.create({
          data: {
            userId,
            stockId: stock?.id ?? null,
            week,
            chain,
            amountUsdc,
            harvestedAt: now(),
            provenance: receipt.source,
            receiptId,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          if (await tx.earning.findUnique({ where: { receiptId } })) return;
        }
        throw error;
      }
      await tx.earningAllocation.create({
        data: { receiptId, week, userId, amountUsdc: toDbRaw(amountUsdc), state: "available" },
      });
      await tx.rewardReceipt.update({ where: { id: receiptId }, data: { state: "available" } });
    });
  }

  // Marks every allocation/receipt attached to a payout order as paid. Called only
  // when the payout reaches its final paid state; a reserved reference alone is
  // never reported as paid.
  async markPayoutFinal(orderId: string): Promise<void> {
    await withTx(async (tx) => {
      await tx.earningAllocation.updateMany({
        where: { payoutOrderId: orderId },
        data: { state: "paid" },
      });
      await tx.rewardReceipt.updateMany({
        where: { payoutOrderId: orderId },
        data: { state: "paid" },
      });
    });
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
    const orderIds = rows.map((r) => r.payoutOrderId).filter((id): id is string => id !== null);
    const orders = await db.rampOrder.findMany({ where: { id: { in: orderIds } } });
    const orderStatus = new Map(orders.map((o) => [o.id, o.status]));
    const tradeIds = rows.map((r) => r.reinvestTradeId).filter((id): id is string => id !== null);
    const trades = await db.tradeOrder.findMany({ where: { id: { in: tradeIds } } });
    const tradeStatus = new Map(trades.map((t) => [t.id, t.status]));
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
        earned += BigInt(row.amountUsdc);
        // Paid/reinvested are reported only after the linked order/trade reached a
        // final state, never from a merely reserved reference.
        if (row.payoutOrderId && orderStatus.get(row.payoutOrderId) === "paid") {
          paid += BigInt(row.amountUsdc);
        }
        if (row.reinvestTradeId && tradeStatus.get(row.reinvestTradeId) === "filled") {
          reinvested += BigInt(row.amountUsdc);
        }
      }
      const pending = earned - paid - reinvested;
      const status =
        paid > 0n && reinvested > 0n
          ? "mixed"
          : paid === earned && earned > 0n
            ? "paid"
            : reinvested === earned && earned > 0n
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
    body: {
      mode: "payout" | "reinvest";
      stock_id?: string;
      consent_version?: string;
      allow_background_conversion?: boolean;
      max_conversion_fee_bps?: number;
      max_fx_bps?: number;
    },
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
    // Each update is a full versioned consent snapshot: omitted limits reset.
    await db.user.update({
      where: { id: userId },
      data: {
        earningsMode: body.mode,
        reinvestStockId: stockId,
        earningsConsentVersion: body.consent_version ?? null,
        allowBackgroundConversion: body.allow_background_conversion ?? false,
        maxConversionFeeBps: body.max_conversion_fee_bps ?? null,
        maxFxBps: body.max_fx_bps ?? null,
      },
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
      consent_version: body.consent_version ?? null,
      allow_background_conversion: body.allow_background_conversion ?? false,
      max_conversion_fee_bps: body.max_conversion_fee_bps ?? null,
      max_fx_bps: body.max_fx_bps ?? null,
    };
  }

  // Reinvest settlement callback: a filled reinvest marks the allocation and
  // receipt reinvested; a failed one releases the reserved earnings exactly once
  // (the journal key is idempotent across the trade-failure and callback paths)
  // and returns the allocation to available.
  async onReinvestSettled(tradeId: string, failed: boolean, key: string, userId: string, chain: string): Promise<void> {
    await withTx(async (tx) => {
      if (failed) {
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
        await tx.earningAllocation.updateMany({
          where: { reinvestTradeId: tradeId },
          data: { state: "available", reinvestTradeId: null },
        });
        await tx.rewardReceipt.updateMany({
          where: { reinvestTradeId: tradeId },
          data: { state: "available", reinvestTradeId: null },
        });
        return;
      }
      await tx.earningAllocation.updateMany({
        where: { reinvestTradeId: tradeId },
        data: { state: "reinvested" },
      });
      await tx.rewardReceipt.updateMany({
        where: { reinvestTradeId: tradeId },
        data: { state: "reinvested" },
      });
    });
  }
}

export const earningsService = new EarningsService();
