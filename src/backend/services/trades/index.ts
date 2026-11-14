import type { TradeOrder } from "@/server/prisma";
import { db, withTx, type Tx } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { controlsService } from "@/backend/services/controls";
import { ledgerService } from "@/backend/services/ledger";
import {
  cashReleased,
  cashReserved,
  stockReleased,
  stockReserved,
  tradeFilled,
} from "@/backend/services/ledger/postings";
import { jobService } from "@/backend/services/jobs";
import { RetryableError } from "@/backend/services/jobs/types";
import { stockService } from "@/backend/services/stocks";
import { CHAINS } from "@/backend/services/wallets/chains";
import { tradeSettledHandlers } from "@/backend/workers/handlers";
import type { TradeDto } from "@/types/dto";
import { fromDbRaw, fromDbRawNullable, toDbRaw } from "@/utils/asset-units";
import { NotFoundException } from "@/utils/exceptions";

import { tradeRouter } from "./router";

export function tradeToDto(t: TradeOrder): TradeDto {
  return {
    id: t.id,
    side: t.side,
    stock_id: t.stockId,
    status: t.status,
    amount_in: fromDbRaw(t.amountIn).toString(),
    amount_out: fromDbRawNullable(t.amountOut)?.toString() ?? null,
    min_amount_out: fromDbRawNullable(t.minAmountOut)?.toString() ?? null,
    failure_reason: t.failureReason,
    retryable: t.side === "buy" && t.status === "failed",
    created_at: t.createdAt.toISOString(),
  };
}

class TradeService {
  async createBuy(
    tx: Tx,
    i: {
      key: string;
      userId: string;
      stockId: string;
      amountIn: bigint;
      purpose: "deposit_buy" | "retry_buy" | "reinvest";
      fundsSource: "cash" | "earnings";
      orderId?: string;
    },
  ): Promise<TradeOrder> {
    const existing = await tx.tradeOrder.findUnique({ where: { key: i.key } });
    if (existing) return existing;
    const stock = await stockService.get(i.stockId);
    const chain = stock.chain;
    const wallet = await tx.wallet.findUnique({
      where: { userId_family: { userId: i.userId, family: CHAINS[chain as keyof typeof CHAINS]?.family ?? "evm" } },
    });
    if (!wallet) {
      throw new NotFoundException("Wallet not provisioned", "WALLET_NOT_READY");
    }
    await ledgerService.post(
      tx,
      cashReserved({ key: i.key, userId: i.userId, chain, amount: i.amountIn, from: i.fundsSource }),
    );
    const trade = await tx.tradeOrder.create({
      data: {
        key: i.key,
        userId: i.userId,
        side: "buy",
        purpose: i.purpose,
        fundsSource: i.fundsSource,
        stockId: i.stockId,
        orderId: i.orderId ?? null,
        chain,
        amountIn: toDbRaw(i.amountIn),
        status: "pending",
        providerMode: "simulated",
      },
    });
    await jobService.enqueue(tx, { kind: "trade.progress", subjectId: trade.id });
    return trade;
  }

  async createSell(
    tx: Tx,
    i: {
      key: string;
      userId: string;
      stockId: string;
      quantity: bigint;
      minAmountOut: bigint;
      orderId: string;
    },
  ): Promise<TradeOrder> {
    const existing = await tx.tradeOrder.findUnique({ where: { key: i.key } });
    if (existing) return existing;
    const stock = await stockService.get(i.stockId);
    await ledgerService.post(
      tx,
      stockReserved({ key: i.key, userId: i.userId, stockId: i.stockId, quantity: i.quantity }),
    );
    const trade = await tx.tradeOrder.create({
      data: {
        key: i.key,
        userId: i.userId,
        side: "sell",
        purpose: "withdrawal_sell",
        fundsSource: "stock",
        stockId: i.stockId,
        orderId: i.orderId,
        chain: stock.chain,
        amountIn: toDbRaw(i.quantity),
        minAmountOut: toDbRaw(i.minAmountOut),
        status: "pending",
        providerMode: "simulated",
      },
    });
    await jobService.enqueue(tx, { kind: "trade.progress", subjectId: trade.id });
    return trade;
  }

  private async releaseFunds(tx: Tx, t: TradeOrder): Promise<void> {
    const amountIn = fromDbRaw(t.amountIn);
    if (t.side === "buy") {
      await ledgerService.post(
        tx,
        cashReleased({
          key: t.key,
          userId: t.userId,
          chain: t.chain,
          amount: amountIn,
          to: t.fundsSource as "cash" | "earnings",
        }),
      );
    } else {
      await ledgerService.post(
        tx,
        stockReleased({ key: t.key, userId: t.userId, stockId: t.stockId, quantity: amountIn }),
      );
    }
  }

  async progress(tradeId: string): Promise<void> {
    const result = await withTx(async (tx) => {
      const t = await tx.tradeOrder.findUniqueOrThrow({ where: { id: tradeId } });
      const amountIn = fromDbRaw(t.amountIn);
      const storedMinAmountOut = fromDbRawNullable(t.minAmountOut);
      if (t.status === "filled" || t.status === "failed") {
        return { trade: t, transitioned: false };
      }
      if (t.status === "pending") {
        if (await controlsService.isPaused("trading", tx)) {
          throw new RetryableError("TRADING_PAUSED", 600_000);
        }
        const stock = await stockService.get(t.stockId);
        const routed = await tradeRouter.route({
          stock,
          side: t.side,
          amountIn,
          key: t.key,
        });
        if (routed.priceImpactBps > policy.trading.maxSlippageBps) {
          await this.releaseFunds(tx, t);
          const failed = await tx.tradeOrder.update({
            where: { id: t.id },
            data: { status: "failed", failureReason: "SLIPPAGE", venueId: routed.venue.id },
          });
          return { trade: failed, transitioned: true };
        }
        const minAmountOut =
          t.side === "buy"
            ? (routed.amountOut * (10_000n - BigInt(policy.trading.maxSlippageBps))) / 10_000n
            : (storedMinAmountOut ?? 0n);
        const wallet = await tx.wallet.findUniqueOrThrow({
          where: {
            userId_family: {
              userId: t.userId,
              family: CHAINS[t.chain as keyof typeof CHAINS]?.family ?? "evm",
            },
          },
        });
        const existing = await routed.venue.getSwap(t.key);
        let ref = existing?.ref ?? null;
        if (!existing) {
          const submitted = await routed.venue.submitSwap({
            key: t.key,
            wallet,
            stock,
            side: t.side,
            amountIn,
            minAmountOut,
          });
          ref = submitted.ref;
        }
        const submitted = await tx.tradeOrder.update({
          where: { id: t.id },
          data: { status: "submitted", venueId: routed.venue.id, venueRef: ref, minAmountOut: toDbRaw(minAmountOut) },
        });
        await jobService.enqueue(tx, {
          kind: "trade.progress",
          subjectId: t.id,
          runAt: new Date(now().getTime() + policy.sim.yellowcard.settleSeconds * 1_000),
        });
        return { trade: submitted, transitioned: false };
      }
      const venue = tradeRouter.venueById(t.venueId ?? "sim-base");
      const remote = await venue.getSwap(t.key);
      if (!remote || remote.status === "pending") {
        return { trade: t, transitioned: false };
      }
      if (remote.status === "filled") {
        await ledgerService.post(
          tx,
          tradeFilled({
            id: t.id,
            userId: t.userId,
            chain: t.chain,
            venueId: t.venueId ?? venue.id,
            stockId: t.stockId,
            side: t.side,
            amountIn,
            amountOut: remote.amountOut ?? 0n,
          }),
        );
        const filled = await tx.tradeOrder.update({
          where: { id: t.id },
          data: { status: "filled", amountOut: toDbRaw(remote.amountOut ?? 0n) },
        });
        return { trade: filled, transitioned: true };
      }
      await this.releaseFunds(tx, t);
      const failed = await tx.tradeOrder.update({
        where: { id: t.id },
        data: { status: "failed", failureReason: remote.failureReason },
      });
      return { trade: failed, transitioned: true };
    });
    if (result.transitioned) {
      const handler = tradeSettledHandlers[result.trade.purpose];
      if (handler) await handler(result.trade);
    }
  }

  async retry(userId: string, tradeId: string, idempotencyKey: string): Promise<TradeDto> {
    const key = `trade-retry:${userId}:${idempotencyKey}`;
    const existing = await db.tradeOrder.findUnique({ where: { key } });
    if (existing) return tradeToDto(existing);
    const trade = await db.tradeOrder.findUnique({ where: { id: tradeId } });
    if (trade?.userId !== userId || trade.side !== "buy" || trade.status !== "failed") {
      throw new NotFoundException("Retryable trade not found", "NOT_FOUND");
    }
    const created = await withTx((tx) =>
      this.createBuy(tx, {
        key,
        userId,
        stockId: trade.stockId,
        amountIn: fromDbRaw(trade.amountIn),
        purpose: "retry_buy",
        fundsSource: "cash",
        orderId: trade.orderId ?? undefined,
      }),
    );
    return tradeToDto(created);
  }
}

export const tradeService = new TradeService();
