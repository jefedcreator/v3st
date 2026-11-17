import type { CustomerOrder } from "@/server/prisma";
import { db, withTx, type Tx } from "@/server/db";
import { now } from "@/backend/clock";
import { toKobo } from "@/backend/services/app/format";
import { customerOrderService } from "@/backend/services/customer-orders";
import { eventService } from "@/backend/services/events";
import { investmentService } from "@/backend/services/investments";
import { jobService } from "@/backend/services/jobs";
import { ratesService } from "@/backend/services/rates";
import { referenceUsable, worstFillSharePriceMicroUsd } from "@/backend/services/stocks/reference";
import { fromDbRaw, fromDbRawNullable, toDbRaw } from "@/utils/asset-units";
import { HttpException } from "@/utils/exceptions";

export function withinLimit(
  side: "buy" | "sell",
  effectiveMicroUsd: bigint,
  limitMicroUsd: bigint,
): boolean {
  return side === "buy"
    ? effectiveMicroUsd <= limitMicroUsd
    : effectiveMicroUsd >= limitMicroUsd;
}

const OPEN_STATUSES = ["waiting_for_payment", "waiting_for_price", "executing"] as const;
const FINAL_STATUSES = ["completed", "failed", "cancelled", "expired"] as const;

class CustomerOrderExecutor {
  async progress(orderId: string): Promise<void> {
    const initial = await db.customerOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (
      initial.status === "waiting_for_payment" &&
      !initial.depositOrderId &&
      initial.expiresAt > now()
    ) {
      // Recreate the funding deposit with the same key if it is missing. A final
      // refusal fails the order inside createFundingDeposit; only a retryable
      // error is left for the job runner.
      try {
        await customerOrderService.createFundingDeposit(initial);
      } catch (error) {
        if (!(error instanceof HttpException && error.statusCode < 500)) throw error;
      }
    }
    const current = await db.customerOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (current.status === "waiting_for_price") {
      await this.tryExecute(orderId);
    }
    let resume = false;
    await withTx(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"customer-order:" + orderId}))`;
      const order = await tx.customerOrder.findUniqueOrThrow({ where: { id: orderId } });
      resume = await this.transition(tx, order);
    });
    if (resume) {
      await customerOrderService.resumeNow(orderId);
    }
  }

  // Returns true when the order is executing without an investment yet.
  private async transition(tx: Tx, order: CustomerOrder): Promise<boolean> {
    const emit = async (status: string) => {
      await eventService.emit(tx, order.userId, "customer_order.updated", order.id, status);
    };
    const revoke = async () => {
      await customerOrderService.revokeConsent(tx, order);
    };
    switch (order.status) {
      case "waiting_for_payment": {
        if (!order.depositOrderId) {
          // No transfer could be opened before the order's lifetime ran out.
          if (order.expiresAt <= now()) {
            await revoke();
            await tx.customerOrder.update({ where: { id: order.id }, data: { status: "expired" } });
            await emit("expired");
          }
          return false;
        }
        const deposit = await tx.rampOrder.findUnique({ where: { id: order.depositOrderId } });
        if (!deposit) return false;
        if (deposit.status === "settled") {
          // Move on only once the landed cash is actually held for the order: the
          // funding transaction posts the hold and records its budget together.
          const hold = order.holdKey
            ? await tx.ledgerJournal.findUnique({ where: { key: `${order.holdKey}:reserve` } })
            : null;
          if (!hold) return false;
          await tx.customerOrder.update({
            where: { id: order.id },
            data: {
              status: "waiting_for_price",
              budgetMicroUsd: order.budgetMicroUsd ?? deposit.usdAmount,
            },
          });
          await emit("waiting_for_price");
          return false;
        }
        if (deposit.status === "expired") {
          await customerOrderService.releaseHold(tx, order);
          await revoke();
          await tx.customerOrder.update({ where: { id: order.id }, data: { status: "expired" } });
          await emit("expired");
          return false;
        }
        if (deposit.status === "refunded" || deposit.status === "failed") {
          await customerOrderService.releaseHold(tx, order);
          await revoke();
          await tx.customerOrder.update({ where: { id: order.id }, data: { status: "failed" } });
          await emit("failed");
          return false;
        }
        return false;
      }
      case "waiting_for_price": {
        if (order.expiresAt <= now()) {
          await customerOrderService.releaseHold(tx, order);
          await revoke();
          await tx.customerOrder.update({ where: { id: order.id }, data: { status: "expired" } });
          await emit("expired");
        }
        return false;
      }
      case "executing": {
        if (!order.investmentId) return true;
        const investment = await tx.investment.findUnique({ where: { id: order.investmentId } });
        if (!investment) return false;
        if (investment.status === "filled" || investment.status === "partial") {
          let rate: { kobo: bigint; microUsd: bigint } | null = null;
          try {
            rate = (await ratesService.display()).payoutRate;
          } catch {
            rate = null;
          }
          const settledMicroUsd =
            order.side === "buy" ? fromDbRaw(investment.amountIn) : (fromDbRawNullable(investment.amountOut) ?? 0n);
          const settledKobo =
            rate === null ? null : toKobo(settledMicroUsd, rate);
          await tx.customerOrder.update({
            where: { id: order.id },
            data: { status: "completed", completedAt: now(), settledKobo },
          });
          await revoke();
          await emit("completed");
          return false;
        }
        if (investment.status === "failed" || investment.status === "cancelled") {
          await tx.customerOrder.update({ where: { id: order.id }, data: { status: "failed" } });
          await revoke();
          await emit("failed");
          return false;
        }
        return false;
      }
      default: {
        // A final order with an unreleased hold (e.g. a transfer that landed
        // after cancellation) releases it exactly once.
        if (order.holdKey && !order.holdReleasedAt) {
          await customerOrderService.releaseHold(tx, order);
        }
        return false;
      }
    }
  }

  // Quotes a waiting-for-price order and, when the fill price is within the
  // consent's limit, executes it through the investment pipeline.
  private async tryExecute(orderId: string): Promise<void> {
    const order = await db.customerOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status !== "waiting_for_price") return;
    const stock = await db.stock.findUniqueOrThrow({ where: { id: order.stockId } });
    if (stock.paused || stock.delisted) return;
    if (!referenceUsable(stock, now())) return;
    let quote;
    try {
      quote =
        order.side === "buy"
          ? await investmentService.quote(order.userId, {
              stockId: stock.id,
              side: "buy",
              inputRaw: order.budgetMicroUsd ?? 0n,
            })
          : await investmentService.quote(order.userId, {
              stockId: stock.id,
              side: "sell",
              inputRaw: fromDbRaw(order.quantityRaw ?? toDbRaw(0n)),
            });
    } catch (error) {
      if (
        error instanceof HttpException &&
        (error.code === "REFERENCE_STALE" || error.code === "PRICE_OUT_OF_RANGE")
      ) {
        return;
      }
      throw error;
    }
    // Judge the limit on the worst fill the quote still allows (its minimum output),
    // not the expected one, so slippage can never carry a fill past the limit.
    const effective = worstFillSharePriceMicroUsd(
      stock,
      order.side,
      BigInt(quote.input_raw),
      BigInt(quote.min_output_raw),
    );
    if (effective === null || !withinLimit(order.side, effective, order.limitPriceMicroUsd)) {
      return;
    }
    await withTx(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"customer-order:" + orderId}))`;
      const current = await tx.customerOrder.findUniqueOrThrow({ where: { id: orderId } });
      if (current.status !== "waiting_for_price") return;
      await tx.customerOrder.update({ where: { id: orderId }, data: { status: "executing" } });
      await eventService.emit(tx, current.userId, "customer_order.updated", orderId, "executing");
    });
    if (!order.authorizationId || !order.holdKey) return;
    try {
      const investment = await investmentService.confirm(
        order.userId,
        quote.id,
        order.authorizationId,
        order.key + ":investment",
        {
          standingAction: order.side === "buy" ? "order_buy" : "order_sell",
          releaseHold: {
            key: order.holdKey,
            kind: order.side === "buy" ? "cash" : "stock",
            amount:
              order.side === "buy"
                ? (order.budgetMicroUsd ?? 0n)
                : fromDbRaw(order.quantityRaw ?? toDbRaw(0n)),
          },
        },
      );
      // The hold was released inside confirm's transaction; linking records it.
      await customerOrderService.linkInvestment(orderId, investment.id);
    } catch {
      // The investment may have committed before the error surfaced: link it.
      const committed = await db.investment.findUnique({ where: { key: order.key + ":investment" } });
      if (committed) {
        await customerOrderService.linkInvestment(orderId, committed.id);
        return;
      }
      // Otherwise the fill could not be confirmed (e.g. the quote expired in
      // between): the order goes back to waiting and the next sweep re-quotes.
      await withTx(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"customer-order:" + orderId}))`;
        const current = await tx.customerOrder.findUniqueOrThrow({ where: { id: orderId } });
        if (current.status === "executing" && !current.investmentId) {
          await tx.customerOrder.update({
            where: { id: orderId },
            data: { status: "waiting_for_price" },
          });
          await eventService.emit(tx, current.userId, "customer_order.updated", orderId, "waiting_for_price");
        }
      });
    }
  }

  async sweep(): Promise<{ enqueued: number }> {
    const open = await db.customerOrder.findMany({
      where: { status: { in: [...OPEN_STATUSES] } },
    });
    const heldFinal = await db.customerOrder.findMany({
      where: {
        status: { in: [...FINAL_STATUSES] },
        holdKey: { not: null },
        holdReleasedAt: null,
      },
    });
    let enqueued = 0;
    for (const order of [...open, ...heldFinal]) {
      await jobService.enqueue(db, { kind: "orders.progress", subjectId: order.id });
      enqueued += 1;
    }
    return { enqueued };
  }
}

export const customerOrderExecutor = new CustomerOrderExecutor();
