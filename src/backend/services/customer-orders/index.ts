import type { CustomerOrder, CustomerOrderPreview, Investment, Prisma, RampOrder } from "@/server/prisma";
import { db, lockRows, withTx, type Tx } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { CUSTOMER_DOCUMENTS } from "@/backend/content/documents";
import { customerChain } from "@/backend/services/app/network";
import { authorizationService } from "@/backend/services/authorizations";
import { depositService } from "@/backend/services/deposits";
import { eventService } from "@/backend/services/events";
import { investmentService } from "@/backend/services/investments";
import { ledgerService } from "@/backend/services/ledger";
import { cashReleased, cashReserved, stockReleased, stockReserved } from "@/backend/services/ledger/postings";
import { fromDbRaw, toDbRaw } from "@/utils/asset-units";
import { sha256Hex } from "@/utils";
import { ConflictException, NotFoundException } from "@/utils/exceptions";
import { ngnToUsd } from "@/utils/money";

// A waiting order lives for 72 hours; a preview only has to be placed within 5 minutes.
export const ORDER_TTL_MS = 259_200_000;
export const PREVIEW_TTL_MS = 300_000;

export type CreatePreviewInput = {
  userId: string;
  stockId: string;
  side: "buy" | "sell";
  funding: "cash" | "bank_transfer" | null;
  mode: "now" | "waiting";
  amountKobo: bigint;
  quantityRaw: bigint | null;
  budgetMicroUsd: bigint | null;
  investmentQuoteId: string | null;
  referencePriceMicroUsd: bigint;
  limitPriceMicroUsd: bigint;
  rateKobo: bigint;
  rateMicroUsd: bigint;
  terms: Prisma.InputJsonValue;
  expiresAt: Date;
};

class CustomerOrderService {
  async createPreview(input: CreatePreviewInput): Promise<CustomerOrderPreview> {
    return db.customerOrderPreview.create({
      data: {
        userId: input.userId,
        stockId: input.stockId,
        side: input.side,
        funding: input.funding,
        mode: input.mode,
        amountKobo: input.amountKobo,
        quantityRaw: input.quantityRaw === null ? null : toDbRaw(input.quantityRaw),
        budgetMicroUsd: input.budgetMicroUsd,
        investmentQuoteId: input.investmentQuoteId,
        referencePriceMicroUsd: input.referencePriceMicroUsd,
        limitPriceMicroUsd: input.limitPriceMicroUsd,
        rateKobo: input.rateKobo,
        rateMicroUsd: input.rateMicroUsd,
        terms: input.terms,
        expiresAt: input.expiresAt,
      },
    });
  }

  // Step 1 of placeNow: lock the preview, check it, create the executing order
  // and consume the preview, all in one transaction.
  private async createExecutingOrder(
    userId: string,
    previewId: string,
    key: string,
  ): Promise<CustomerOrder> {
    const orderKey = `app-order:${userId}:${key}`;
    return withTx(async (tx) => {
      await lockRows(tx, "customer_order_previews", [previewId]);
      const preview = await tx.customerOrderPreview.findUniqueOrThrow({ where: { id: previewId } });
      if (preview.userId !== userId) {
        throw new NotFoundException("Preview not found");
      }
      if (preview.consumedAt) {
        throw new ConflictException("Preview already used", "QUOTE_CONSUMED");
      }
      if (preview.expiresAt <= now()) {
        throw new ConflictException("Preview expired", "PREVIEW_EXPIRED");
      }
      const order = await tx.customerOrder.create({
        data: {
          userId,
          key: orderKey,
          requestHash: sha256Hex(previewId),
          previewId: preview.id,
          stockId: preview.stockId,
          side: preview.side,
          funding: preview.funding,
          status: "executing",
          amountKobo: preview.amountKobo,
          budgetMicroUsd: preview.budgetMicroUsd,
          quantityRaw: preview.quantityRaw,
          limitPriceMicroUsd: preview.limitPriceMicroUsd,
          rateKobo: preview.rateKobo,
          rateMicroUsd: preview.rateMicroUsd,
          expiresAt: preview.expiresAt,
        },
      });
      await tx.customerOrderPreview.update({
        where: { id: preview.id },
        data: { consumedAt: now() },
      });
      await eventService.emit(tx, userId, "customer_order.updated", order.id, "executing");
      return order;
    });
  }

  // Steps 2-4: bind a one-time consent to the preview's quote, confirm the
  // investment under the order's keys, then link both on the order row.
  private async consentAndConfirm(order: CustomerOrder, quoteId: string): Promise<void> {
    const consent = await authorizationService.create(
      order.userId,
      {
        kind: "one_time",
        quote_kind: "investment",
        quote_id: quoteId,
        policy_version: policy.app.policyVersion,
        disclosure_version: CUSTOMER_DOCUMENTS.risks.version,
      },
      order.key + ":consent",
    );
    const investment = await investmentService.confirm(
      order.userId,
      quoteId,
      consent.dto.id,
      order.key + ":investment",
    );
    await withTx(async (tx) => {
      await tx.customerOrder.update({
        where: { id: order.id },
        data: { authorizationId: consent.dto.id, investmentId: investment.id },
      });
    });
  }

  async placeNow(userId: string, previewId: string, key: string): Promise<CustomerOrder> {
    const preview = await db.customerOrderPreview.findUnique({ where: { id: previewId } });
    if (preview?.userId !== userId) {
      throw new NotFoundException("Preview not found");
    }
    if (!preview.investmentQuoteId) {
      throw new ConflictException("Preview has no live quote", "QUOTE_EXPIRED");
    }
    const order = await this.createExecutingOrder(userId, previewId, key);
    await this.consentAndConfirm(order, preview.investmentQuoteId);
    return db.customerOrder.findUniqueOrThrow({ where: { id: order.id } });
  }

  // Retries steps 2-4 with the same keys for an executing order whose
  // investment was never created (e.g. the confirm call was interrupted).
  async resumeNow(orderId: string): Promise<void> {
    const order = await db.customerOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status !== "executing" || order.investmentId) return;
    const preview = await db.customerOrderPreview.findUniqueOrThrow({
      where: { id: order.previewId },
    });
    if (!preview.investmentQuoteId) return;
    await this.consentAndConfirm(order, preview.investmentQuoteId);
  }

  // Releases a waiting order's hold exactly once (cash or shares back to the
  // customer), keyed `${holdKey}:release`, and marks it released.
  async releaseHold(tx: Tx, order: CustomerOrder): Promise<void> {
    if (!order.holdKey || order.holdReleasedAt) return;
    if (order.side === "buy") {
      const amount = order.budgetMicroUsd ?? 0n;
      if (amount > 0n) {
        await ledgerService.post(
          tx,
          cashReleased({
            key: order.holdKey,
            userId: order.userId,
            chain: customerChain(),
            amount,
            to: "cash",
          }),
        );
      }
    } else {
      const quantity = order.quantityRaw === null ? 0n : fromDbRaw(order.quantityRaw);
      if (quantity > 0n) {
        await ledgerService.post(
          tx,
          stockReleased({
            key: order.holdKey,
            userId: order.userId,
            stockId: order.stockId,
            quantity,
          }),
        );
      }
    }
    await tx.customerOrder.update({
      where: { id: order.id },
      data: { holdReleasedAt: now() },
    });
  }

  async revokeConsent(tx: Tx, order: CustomerOrder): Promise<void> {
    if (!order.authorizationId) return;
    const auth = await tx.investmentAuthorization.findUnique({
      where: { id: order.authorizationId },
    });
    if (auth && !auth.revokedAt) {
      await tx.investmentAuthorization.update({
        where: { id: auth.id },
        data: { revokedAt: now(), epoch: auth.epoch + 1 },
      });
    }
  }

  // Places a waiting order: consent with the price limit, a hold on the cash
  // (cash buy) or shares (sell), and — for bank transfers — a funding deposit.
  async placeWaiting(userId: string, previewId: string, key: string): Promise<CustomerOrder> {
    const orderKey = `app-order:${userId}:${key}`;
    const order = await withTx(async (tx) => {
      await lockRows(tx, "customer_order_previews", [previewId]);
      const preview = await tx.customerOrderPreview.findUniqueOrThrow({ where: { id: previewId } });
      if (preview.userId !== userId) {
        throw new NotFoundException("Preview not found");
      }
      if (preview.consumedAt) {
        throw new ConflictException("Preview already used", "QUOTE_CONSUMED");
      }
      if (preview.expiresAt <= now()) {
        throw new ConflictException("Preview expired", "PREVIEW_EXPIRED");
      }
      const status = preview.funding === "bank_transfer" ? "waiting_for_payment" : "waiting_for_price";
      const expiresAt = new Date(now().getTime() + ORDER_TTL_MS);
      const created = await tx.customerOrder.create({
        data: {
          userId,
          key: orderKey,
          requestHash: sha256Hex(previewId),
          previewId: preview.id,
          stockId: preview.stockId,
          side: preview.side,
          funding: preview.funding,
          status,
          amountKobo: preview.amountKobo,
          budgetMicroUsd: preview.budgetMicroUsd,
          quantityRaw: preview.quantityRaw,
          limitPriceMicroUsd: preview.limitPriceMicroUsd,
          rateKobo: preview.rateKobo,
          rateMicroUsd: preview.rateMicroUsd,
          expiresAt,
        },
      });
      const holdKey = `order-hold:${created.id}`;
      const maxNgnKobo =
        preview.side === "buy"
          ? preview.amountKobo
          : (preview.amountKobo * 10_300n + 9_999n) / 10_000n;
      const consent = await authorizationService.createOrderConsent(tx, userId, {
        orderId: created.id,
        side: preview.side,
        stockId: preview.stockId,
        maxNgnKobo,
        limitPriceMicroUsd: preview.limitPriceMicroUsd,
        expiresAt,
      });
      if (preview.side === "sell") {
        await ledgerService.post(
          tx,
          stockReserved({
            key: holdKey,
            userId,
            stockId: preview.stockId,
            quantity: fromDbRaw(preview.quantityRaw ?? toDbRaw(0n)),
          }),
        );
      } else if (preview.funding === "cash") {
        const budget =
          preview.budgetMicroUsd ??
          ngnToUsd(preview.amountKobo, { kobo: preview.rateKobo, microUsd: preview.rateMicroUsd }, "floor");
        await ledgerService.post(
          tx,
          cashReserved({ key: holdKey, userId, chain: customerChain(), amount: budget, from: "cash" }),
        );
      }
      const updated = await tx.customerOrder.update({
        where: { id: created.id },
        data: { authorizationId: consent.id, holdKey },
      });
      await tx.customerOrderPreview.update({
        where: { id: preview.id },
        data: { consumedAt: now() },
      });
      await eventService.emit(tx, userId, "customer_order.updated", created.id, status);
      return updated;
    });
    if (order.funding === "bank_transfer") {
      const { deposit } = await depositService.create(
        userId,
        { ngn_amount: order.amountKobo },
        order.key + ":deposit",
        { chain: customerChain(), holdFor: { key: order.holdKey!, orderId: order.id } },
      );
      await withTx(async (tx) => {
        await tx.customerOrder.update({
          where: { id: order.id },
          data: { depositOrderId: deposit.id },
        });
      });
    }
    return db.customerOrder.findUniqueOrThrow({ where: { id: order.id } });
  }

  async cancel(userId: string, orderId: string): Promise<CustomerOrder> {
    return withTx(async (tx) => {
      await lockRows(tx, "customer_orders", [orderId]);
      const order = await tx.customerOrder.findUniqueOrThrow({ where: { id: orderId } });
      if (order.userId !== userId) {
        throw new NotFoundException("Order not found");
      }
      if (order.status !== "waiting_for_payment" && order.status !== "waiting_for_price") {
        throw new ConflictException(
          "This order has already started and can't be cancelled",
          "ORDER_NOT_CANCELLABLE",
        );
      }
      await this.releaseHold(tx, order);
      await this.revokeConsent(tx, order);
      const updated = await tx.customerOrder.update({
        where: { id: order.id },
        data: { status: "cancelled" },
      });
      await eventService.emit(tx, userId, "customer_order.updated", order.id, "cancelled");
      return updated;
    });
  }

  async load(
    userId: string,
    orderId: string,
  ): Promise<{ order: CustomerOrder; investment: Investment | null; deposit: RampOrder | null }> {
    const order = await db.customerOrder.findUnique({ where: { id: orderId } });
    if (order?.userId !== userId) {
      throw new NotFoundException("Order not found");
    }
    const investment = order.investmentId
      ? await db.investment.findUnique({ where: { id: order.investmentId } })
      : null;
    const deposit = order.depositOrderId
      ? await db.rampOrder.findUnique({ where: { id: order.depositOrderId } })
      : null;
    return { order, investment, deposit };
  }
}

export const customerOrderService = new CustomerOrderService();
