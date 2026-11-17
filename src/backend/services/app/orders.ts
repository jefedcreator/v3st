import type { CustomerOrder, Investment, RampOrder, Stock } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { CUSTOMER_DOCUMENTS } from "@/backend/content/documents";
import { appCatalogService, type AppStockRefDto } from "@/backend/services/app/catalog";
import type { AppPayToDto } from "@/backend/services/app/cash";
import { customerChain } from "@/backend/services/app/network";
import { customerReference, formatNaira, formatShares, sharesMicroOf, toKobo } from "@/backend/services/app/format";
import { appOnboardingService } from "@/backend/services/app/onboarding";
import { customerOrderService } from "@/backend/services/customer-orders";
import type { InvestmentQuoteDto } from "@/backend/services/investments";
import { investmentService } from "@/backend/services/investments";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { positionService } from "@/backend/services/positions";
import { ratesService } from "@/backend/services/rates";
import { securityService } from "@/backend/services/security";
import { referenceUsable, sharePriceMicroUsd, tokenPriceMicroUsd } from "@/backend/services/stocks/reference";
import type { OrderPreviewBody } from "@/backend/validators/app/orders.validator";
import { fromDbRaw } from "@/utils/asset-units";
import { sha256Hex } from "@/utils";
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@/utils/exceptions";
import { ngnToUsd, type Rate } from "@/utils/money";

export type AppOrderPreviewDto = {
  preview_id: string;
  stock: AppStockRefDto;
  side: "buy" | "sell";
  pay_with: "cash" | "bank_transfer" | null;
  executes: "now" | "when_prices_update" | "after_your_transfer";
  amount_kobo: string;
  shares_micro: string;
  price_kobo: string;
  price_limit_kobo: string | null;
  fees: { label: string; kobo: string | null; note: string | null }[];
  you_receive_kobo: string | null;
  expires_at: string;
  order_valid_until: string | null;
  notes: string[];
};

export type AppOrderStatus =
  | "waiting_for_payment"
  | "waiting_for_price"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export type AppOrderDto = {
  id: string;
  reference: string;
  stock: AppStockRefDto;
  side: "buy" | "sell";
  status: AppOrderStatus;
  title: string;
  detail: string;
  amount_kobo: string | null;
  shares_micro: string | null;
  price_kobo: string | null;
  pay_to: AppPayToDto | null;
  can_cancel: boolean;
  valid_until: string | null;
  timeline: { label: string; done: boolean; at: string | null }[];
  created_at: string;
  completed_at: string | null;
};

// The customer-facing view of an order's state, shared with the activity feed.
export function orderView(
  order: CustomerOrder,
  investment: Investment | null,
  deposit: RampOrder | null,
  stock: Stock,
): Pick<AppOrderDto, "status" | "title" | "detail" | "can_cancel" | "timeline"> {
  const name = appCatalogService.stockRef(stock).name;
  const buy = order.side === "buy";
  const rate: Rate = { kobo: order.rateKobo, microUsd: order.rateMicroUsd };
  const sharesMicro =
    order.quantityRaw === null ? null : sharesMicroOf(fromDbRaw(order.quantityRaw), stock.decimals);
  const amountText = formatNaira(buy ? order.amountKobo : (order.settledKobo ?? order.amountKobo));
  const sharesText = sharesMicro === null ? "0 shares" : formatShares(sharesMicro);
  const limitText = formatNaira(toKobo(order.limitPriceMicroUsd, rate));

  let status: AppOrderStatus;
  let title: string;
  let detail: string;
  switch (order.status) {
    case "waiting_for_payment":
      status = "waiting_for_payment";
      title = "Waiting for your transfer";
      detail = `Send ${formatNaira(order.amountKobo)} to the account below. We'll buy ${name} when it arrives.`;
      break;
    case "waiting_for_price":
      status = "waiting_for_price";
      title = "Waiting for prices to update";
      detail = `Your order goes through at the next price update, at no ${buy ? "more" : "less"} than ${limitText} per share.`;
      break;
    case "cancelled":
      status = "cancelled";
      title = "Order cancelled";
      detail = buy ? "Your money is in your cash." : "Your shares are still yours.";
      break;
    case "expired":
      status = "expired";
      title = "Order expired";
      detail = `The price didn't stay within your limit in time. ${buy ? "Your money is in your cash." : "Your shares are still yours."}`;
      break;
    case "failed":
      status = "failed";
      title = "Order didn't go through";
      detail = buy ? "Your money is back in your cash." : "Your shares are still yours.";
      break;
    case "completed":
      status = "completed";
      title = `${buy ? "Bought" : "Sold"} ${name}`;
      detail = `${sharesText} for ${amountText}.`;
      break;
    default: {
      const investmentStatus = investment?.status ?? null;
      if (investmentStatus === "filled" || investmentStatus === "partial") {
        status = "completed";
        title = `${buy ? "Bought" : "Sold"} ${name}`;
        detail = `${sharesText} for ${amountText}.`;
      } else if (investmentStatus === "failed" || investmentStatus === "cancelled") {
        status = "failed";
        title = "Order didn't go through";
        detail = buy ? "Your money is back in your cash." : "Your shares are still yours.";
      } else {
        status = "processing";
        title = `${buy ? "Buying" : "Selling"} ${name}`;
        detail = investment?.holdReason
          ? "This is taking longer than usual. Your money is safe."
          : "This usually takes under a minute.";
      }
      break;
    }
  }

  const canCancel = order.status === "waiting_for_payment" || order.status === "waiting_for_price";
  const timeline: AppOrderDto["timeline"] = [
    { label: "Order placed", done: true, at: order.createdAt.toISOString() },
  ];
  if (deposit) {
    timeline.push({
      label: "Transfer received",
      done: deposit.status === "settled",
      at: deposit.status === "settled" ? deposit.updatedAt.toISOString() : null,
    });
  }
  timeline.push(
    {
      label: buy ? "Buying shares" : "Selling shares",
      done: status !== "processing" && status !== "waiting_for_payment" && status !== "waiting_for_price",
      at: order.completedAt ? order.completedAt.toISOString() : null,
    },
    {
      label: "Done",
      done: status === "completed",
      at: order.completedAt ? order.completedAt.toISOString() : null,
    },
  );
  return { status, title, detail, can_cancel: canCancel, timeline };
}

class AppOrdersService {
  async preview(userId: string, input: OrderPreviewBody): Promise<AppOrderPreviewDto> {
    await appOnboardingService.assertReady(userId, "invest");
    const stock = await db.stock.findUnique({ where: { id: input.stock_id } });
    if (!stock) throw new NotFoundException("Stock not found");
    const positions = await positionService.list(userId);
    const held = positions.find(
      (p) =>
        p.stock_id === stock.id &&
        (BigInt(p.raw_owned) > 0n || BigInt(p.raw_reserved) > 0n),
    );
    if (!appCatalogService.inCatalog(stock) && !held) {
      throw new NotFoundException("Stock not found");
    }
    const at = now();
    const display = await ratesService.display();
    const payoutRate = display.payoutRate;
    const depositRate = display.depositRate;

    const side = input.side;
    const sellAll = side === "sell" && "sell_all" in input;
    let amountKobo: bigint;
    let payWith: "cash" | "bank_transfer" | null = null;
    if (side === "buy") {
      amountKobo = input.amount_kobo;
      const cash = await ledgerService.balance(acct.userCash(userId, customerChain()));
      const needed = ngnToUsd(amountKobo, depositRate, "floor");
      payWith = input.pay_with ?? (cash >= needed ? "cash" : "bank_transfer");
    } else {
      amountKobo = sellAll ? 0n : input.amount_kobo;
    }

    let quantityRaw: bigint | null = null;
    if (side === "sell") {
      const holding = await ledgerService.balance(acct.userStock(userId, stock.id));
      const tokenPrice = tokenPriceMicroUsd(stock);
      if (sellAll) {
        quantityRaw = holding;
        if (quantityRaw <= 0n) {
          throw new ConflictException("You don't have that many shares", "INSUFFICIENT_SHARES");
        }
        amountKobo =
          tokenPrice === null
            ? 0n
            : toKobo((holding * tokenPrice) / 10n ** BigInt(stock.decimals), payoutRate);
      } else {
        if (tokenPrice === null || tokenPrice <= 0n) {
          throw new UnprocessableEntityException("Reference price is missing or stale", "REFERENCE_STALE");
        }
        const usd = ngnToUsd(amountKobo, payoutRate, "floor");
        quantityRaw = (usd * 10n ** BigInt(stock.decimals)) / tokenPrice;
        if (quantityRaw <= 0n) {
          throw new UnprocessableEntityException("Amount is too small", "VALIDATION_FAILED");
        }
        if (quantityRaw > holding) {
          throw new ConflictException("You don't have that many shares", "INSUFFICIENT_SHARES");
        }
      }
    }

    const trading =
      stock.paused || stock.delisted ? "paused" : referenceUsable(stock, at) ? "available" : "prices_updating";
    const immediate = trading === "available" && (side === "sell" || payWith === "cash");

    // In this task every preview is priced through a live quote; a stale or
    // out-of-band reference propagates as PRICES_UPDATING.
    const quote: InvestmentQuoteDto =
      side === "buy"
        ? await investmentService.quote(userId, {
            stockId: stock.id,
            side: "buy",
            budgetNgn: amountKobo,
          })
        : await investmentService.quote(userId, {
            stockId: stock.id,
            side: "sell",
            inputRaw: quantityRaw!,
          });

    const rate: Rate = side === "buy" ? depositRate : payoutRate;
    const sharePrice = sharePriceMicroUsd(stock);
    if (sharePrice === null || sharePrice <= 0n) {
      throw new UnprocessableEntityException("Reference price is missing or stale", "REFERENCE_STALE");
    }
    const limitPriceMicroUsd =
      side === "buy"
        ? (sharePrice * 10_300n + 9_999n) / 10_000n
        : (sharePrice * 9_700n) / 10_000n;
    const feeKobo = (raw: string): string | null => toKobo(BigInt(raw), rate).toString();
    const fees = [
      { label: "V3ST fee", kobo: feeKobo(quote.fee_usdc_raw), note: null },
      { label: "Currency conversion", kobo: feeKobo(quote.fx_fee_usdc_raw), note: null },
      { label: "Trading fee", kobo: feeKobo(quote.venue_fee_usdc_raw), note: null },
    ];
    const preview = await customerOrderService.createPreview({
      userId,
      stockId: stock.id,
      side,
      funding: side === "buy" ? payWith : null,
      mode: immediate ? "now" : "waiting",
      amountKobo,
      quantityRaw: side === "buy" ? BigInt(quote.expected_output_raw) : quantityRaw,
      budgetMicroUsd: side === "buy" ? BigInt(quote.input_raw) : null,
      investmentQuoteId: immediate ? quote.id : null,
      referencePriceMicroUsd: sharePrice,
      limitPriceMicroUsd,
      rateKobo: rate.kobo,
      rateMicroUsd: rate.microUsd,
      terms: {
        policy_version: policy.app.policyVersion,
        disclosure_version: CUSTOMER_DOCUMENTS.risks.version,
        fees,
      },
      expiresAt: new Date(quote.expires_at),
    });
    return {
      preview_id: preview.id,
      stock: appCatalogService.stockRef(stock),
      side,
      pay_with: side === "buy" ? payWith : null,
      executes: immediate ? "now" : "after_your_transfer",
      amount_kobo: amountKobo.toString(),
      shares_micro: sharesMicroOf(
        side === "buy" ? BigInt(quote.expected_output_raw) : quantityRaw!,
        stock.decimals,
      ).toString(),
      price_kobo: toKobo(sharePrice, rate).toString(),
      price_limit_kobo: immediate ? null : toKobo(limitPriceMicroUsd, rate).toString(),
      fees,
      you_receive_kobo:
        side === "sell" ? toKobo(BigInt(quote.expected_output_raw), rate).toString() : null,
      expires_at: preview.expiresAt.toISOString(),
      order_valid_until: null,
      notes: [],
    };
  }

  async place(
    userId: string,
    input: { previewId: string; pin: string },
    clientKey: string,
  ): Promise<{ dto: AppOrderDto; created: boolean }> {
    const key = `app-order:${userId}:${clientKey}`;
    const requestHash = sha256Hex(input.previewId);
    const existing = await db.customerOrder.findUnique({ where: { key } });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          "Idempotency key reused with a different preview",
          "IDEMPOTENCY_KEY_REUSED",
        );
      }
      return { dto: await this.get(userId, existing.id), created: false };
    }
    await appOnboardingService.assertReady(userId, "invest");
    await securityService.verifyPin(userId, input.pin);
    const preview = await db.customerOrderPreview.findUnique({ where: { id: input.previewId } });
    if (preview?.userId !== userId) {
      throw new NotFoundException("Preview not found");
    }
    if (preview.mode !== "now" || !preview.investmentQuoteId) {
      throw new UnprocessableEntityException(
        "This preview is waiting on a price or a transfer",
        "VALIDATION_FAILED",
      );
    }
    try {
      const order = await customerOrderService.placeNow(userId, input.previewId, clientKey);
      return { dto: await this.get(userId, order.id), created: true };
    } catch (error) {
      // A concurrent place with the same key won the preview lock; return the
      // stored order instead of surfacing the consumed-preview conflict.
      if (error instanceof ConflictException && error.code === "QUOTE_CONSUMED") {
        const raced = await db.customerOrder.findUnique({ where: { key } });
        if (raced) {
          return { dto: await this.get(userId, raced.id), created: false };
        }
      }
      throw error;
    }
  }

  async get(userId: string, orderId: string): Promise<AppOrderDto> {
    const { order, investment, deposit } = await customerOrderService.load(userId, orderId);
    const stock = await db.stock.findUniqueOrThrow({ where: { id: order.stockId } });
    let rate: Rate | null = null;
    try {
      rate = (await ratesService.display()).payoutRate;
    } catch {
      rate = null;
    }
    const sharePrice = sharePriceMicroUsd(stock);
    const payTo: AppPayToDto | null =
      deposit?.payToAccountNumber
        ? {
            bank_name: deposit.payToBankName ?? "",
            account_number: deposit.payToAccountNumber,
            account_name: deposit.payToAccountName ?? "",
            reference: deposit.payToReference,
            amount_kobo: deposit.ngnAmount.toString(),
            expires_at: deposit.expiresAt ? deposit.expiresAt.toISOString() : null,
          }
        : null;
    return {
      id: order.id,
      reference: customerReference(order.id),
      stock: appCatalogService.stockRef(stock),
      side: order.side,
      ...orderView(order, investment, deposit, stock),
      amount_kobo: order.amountKobo.toString(),
      shares_micro:
        order.quantityRaw === null
          ? null
          : sharesMicroOf(fromDbRaw(order.quantityRaw), stock.decimals).toString(),
      price_kobo: sharePrice !== null && rate !== null ? toKobo(sharePrice, rate).toString() : null,
      pay_to: payTo,
      valid_until: order.expiresAt.toISOString(),
      created_at: order.createdAt.toISOString(),
      completed_at: order.completedAt ? order.completedAt.toISOString() : null,
    };
  }
}

export const appOrdersService = new AppOrdersService();
