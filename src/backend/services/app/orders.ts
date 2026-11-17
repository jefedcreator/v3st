import type { CustomerOrder, Investment, RampOrder, Stock } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { CUSTOMER_DOCUMENTS } from "@/backend/content/documents";
import { appCatalogService } from "@/backend/services/app/catalog";
import type { AppPayToDto } from "@/backend/services/app/cash";
import { customerChain } from "@/backend/services/app/network";
import { customerReference, formatNaira, formatShares, sharesMicroOf, toKobo } from "@/backend/services/app/format";
import { appOnboardingService } from "@/backend/services/app/onboarding";
import { customerOrderService, ORDER_TTL_MS, PREVIEW_TTL_MS } from "@/backend/services/customer-orders";
import { bankAccountService } from "@/backend/services/bank-accounts";
import { controlsService } from "@/backend/services/controls";
import { rampRegistry } from "@/backend/services/ramp";
import { ProviderError } from "@/backend/services/ramp/errors";
import type { InvestmentQuoteDto } from "@/backend/services/investments";
import { investmentService } from "@/backend/services/investments";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { positionService } from "@/backend/services/positions";
import { ratesService } from "@/backend/services/rates";
import { securityService } from "@/backend/services/security";
import {
  referenceDisplay,
  sharePriceMicroUsd,
  tokenPriceMicroUsd,
} from "@/backend/services/stocks/reference";
import type { OrderPreviewBody } from "@/backend/validators/app/orders.validator";
import { fromDbRaw, fromDbRawNullable } from "@/utils/asset-units";
import { sha256Hex } from "@/utils";
import {
  ConflictException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@/utils/exceptions";
import { ngnToUsd, type Rate } from "@/utils/money";
import type { AppOrderPreviewDto, AppOrderStatus, AppOrderDto } from "@/types/app";

export type { AppOrderPreviewDto, AppOrderStatus, AppOrderDto } from "@/types/app";

// The shares an order is about: what actually changed hands once the
// investment filled (bought shares come out, sold shares go in), otherwise the
// previewed estimate.
export function orderSharesRaw(order: CustomerOrder, investment: Investment | null): bigint | null {
  if (investment && (investment.status === "filled" || investment.status === "partial")) {
    const filled = order.side === "buy" ? fromDbRawNullable(investment.amountOut) : fromDbRaw(investment.amountIn);
    if (filled !== null) return filled;
  }
  return order.quantityRaw === null ? null : fromDbRaw(order.quantityRaw);
}

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
  const sharesRaw = orderSharesRaw(order, investment);
  const sharesMicro = sharesRaw === null ? null : sharesMicroOf(sharesRaw, stock.decimals);
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
      if (payWith === "cash" && cash < needed) {
        throw new ConflictException("Insufficient funds", "INSUFFICIENT_FUNDS");
      }
      if (payWith === "bank_transfer") {
        // Placing a bank-transfer buy opens a deposit. Refuse here what that
        // deposit would refuse, so an order never waits for a transfer that
        // can't be opened.
        await controlsService.assertOpen("deposits", "DEPOSITS_PAUSED");
        if (amountKobo > policy.deposits.maxKobo) {
          throw new UnprocessableEntityException("Above the bank transfer limit", "LIMIT_EXCEEDED");
        }
        if (!(await bankAccountService.getActiveRow(userId))) {
          throw new ConflictException("Add your bank account first", "ONBOARDING_INCOMPLETE");
        }
      }
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

    // Immediate mode is a cash buy or any sell with a live quote. A stale or
    // out-of-band reference turns the preview into a waiting order instead.
    const wantsImmediate = side === "sell" || payWith === "cash";
    let quote: InvestmentQuoteDto | null = null;
    if (wantsImmediate) {
      try {
        quote =
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
      } catch (error) {
        if (
          error instanceof HttpException &&
          (error.code === "REFERENCE_STALE" || error.code === "PRICE_OUT_OF_RANGE")
        ) {
          quote = null;
        } else {
          throw error;
        }
      }
    }

    const rate: Rate = side === "buy" ? depositRate : payoutRate;
    const sharePrice = sharePriceMicroUsd(stock);
    const tokenPrice = tokenPriceMicroUsd(stock);
    const displayRef = referenceDisplay(stock, at);
    if (sharePrice === null || sharePrice <= 0n || (quote === null && displayRef === null)) {
      throw new UnprocessableEntityException("Stock is not available right now", "STOCK_UNAVAILABLE");
    }
    const limitPriceMicroUsd =
      side === "buy"
        ? (sharePrice * 10_300n + 9_999n) / 10_000n
        : (sharePrice * 9_700n) / 10_000n;
    const immediate = quote !== null;
    const mode = immediate ? ("now" as const) : ("waiting" as const);
    const executes = immediate
      ? ("now" as const)
      : payWith === "bank_transfer"
        ? ("after_your_transfer" as const)
        : ("when_prices_update" as const);

    const budgetMicroUsd =
      side === "buy"
        ? immediate
          ? BigInt(quote!.input_raw)
          : payWith === "cash"
            ? ngnToUsd(amountKobo, depositRate, "floor")
            : null
        : null;
    const estimatedQuantityRaw =
      side === "buy"
        ? immediate
          ? BigInt(quote!.expected_output_raw)
          : tokenPrice === null || tokenPrice <= 0n || budgetMicroUsd === null
            ? null
            : (budgetMicroUsd * 10n ** BigInt(stock.decimals)) / tokenPrice
        : quantityRaw;

    let fees: { label: string; kobo: string | null; note: string | null }[];
    let notes: string[] = [];
    if (immediate) {
      const feeKobo = (raw: string): string | null => toKobo(BigInt(raw), rate).toString();
      fees = [
        { label: "V3ST fee", kobo: feeKobo(quote!.fee_usdc_raw), note: null },
        { label: "Currency conversion", kobo: feeKobo(quote!.fx_fee_usdc_raw), note: null },
        { label: "Trading fee", kobo: feeKobo(quote!.venue_fee_usdc_raw), note: null },
      ];
    } else {
      fees = [{ label: "Trading fee", kobo: null, note: "Up to 1%" }];
      if (payWith === "bank_transfer") {
        const provider = await rampRegistry.selectForNewOrder("in");
        let feeNgn: bigint;
        try {
          feeNgn = (await provider.quote("in", amountKobo)).feeNgn;
        } catch (error) {
          if (error instanceof ProviderError) {
            throw new ServiceUnavailableException("Bank transfer quote unavailable", "RAIL_UNAVAILABLE");
          }
          throw error;
        }
        fees.push({ label: "Bank transfer fee", kobo: feeNgn.toString(), note: null });
      }
      notes = [
        "If the price moves more than 3% against you before your order goes through, it won't go through and your money stays safe.",
      ];
    }

    const preview = await customerOrderService.createPreview({
      userId,
      stockId: stock.id,
      side,
      funding: side === "buy" ? payWith : null,
      mode,
      amountKobo,
      quantityRaw: estimatedQuantityRaw,
      budgetMicroUsd,
      investmentQuoteId: immediate ? quote!.id : null,
      referencePriceMicroUsd: sharePrice,
      limitPriceMicroUsd,
      rateKobo: rate.kobo,
      rateMicroUsd: rate.microUsd,
      terms: {
        policy_version: policy.app.policyVersion,
        disclosure_version: CUSTOMER_DOCUMENTS.risks.version,
        fees,
        notes,
      },
      expiresAt: immediate
        ? new Date(quote!.expires_at)
        : new Date(now().getTime() + PREVIEW_TTL_MS),
    });
    const sharesMicro =
      estimatedQuantityRaw === null
        ? null
        : sharesMicroOf(estimatedQuantityRaw, stock.decimals);
    return {
      preview_id: preview.id,
      stock: appCatalogService.stockRef(stock),
      side,
      pay_with: side === "buy" ? payWith : null,
      executes,
      amount_kobo: amountKobo.toString(),
      shares_micro: sharesMicro === null ? "0" : sharesMicro.toString(),
      price_kobo: toKobo(sharePrice, rate).toString(),
      price_limit_kobo: immediate ? null : toKobo(limitPriceMicroUsd, rate).toString(),
      fees,
      you_receive_kobo:
        side === "sell"
          ? immediate
            ? toKobo(BigInt(quote!.expected_output_raw), rate).toString()
            : tokenPrice === null
              ? null
              : toKobo((quantityRaw! * tokenPrice) / 10n ** BigInt(stock.decimals), rate).toString()
          : null,
      expires_at: preview.expiresAt.toISOString(),
      order_valid_until: immediate
        ? null
        : new Date(now().getTime() + ORDER_TTL_MS).toISOString(),
      notes,
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
    try {
      const order =
        preview.mode === "now" && preview.investmentQuoteId
          ? await customerOrderService.placeNow(userId, input.previewId, clientKey)
          : await customerOrderService.placeWaiting(userId, input.previewId, clientKey);
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

  async cancel(userId: string, orderId: string): Promise<AppOrderDto> {
    await customerOrderService.cancel(userId, orderId);
    return this.get(userId, orderId);
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
      shares_micro: (() => {
        const raw = orderSharesRaw(order, investment);
        return raw === null ? null : sharesMicroOf(raw, stock.decimals).toString();
      })(),
      price_kobo: sharePrice !== null && rate !== null ? toKobo(sharePrice, rate).toString() : null,
      pay_to: payTo,
      valid_until: order.expiresAt.toISOString(),
      created_at: order.createdAt.toISOString(),
      completed_at: order.completedAt ? order.completedAt.toISOString() : null,
    };
  }
}

export const appOrdersService = new AppOrdersService();
