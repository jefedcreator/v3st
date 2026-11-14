import type { ChainTransfer, RampOrder, TradeOrder } from "@/server/prisma";
import { db, withTx, type Tx } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { alertService } from "@/backend/services/alerts";
import { bankAccountService } from "@/backend/services/bank-accounts";
import { complianceService, customerFor } from "@/backend/services/compliance";
import { controlsService } from "@/backend/services/controls";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import {
  cashReleased,
  cashReserved,
  directPayoutCollected,
  directPayoutRefunded,
  payoutCollected,
  payoutPaid,
  payoutRejected,
  payoutSubmitted,
  userFunded,
} from "@/backend/services/ledger/postings";
import { jobService } from "@/backend/services/jobs";
import { RetryableError } from "@/backend/services/jobs/types";
import { orderService } from "@/backend/services/orders";
import { ProviderError } from "@/backend/services/ramp/errors";
import { rampRegistry } from "@/backend/services/ramp";
import { paycrestFundingAddress } from "@/backend/services/ramp/paycrest";
import type { Quote } from "@/backend/services/ramp/types";
import { refForKey } from "@/backend/services/simulator/ramp";
import { simulatedVenue } from "@/backend/services/simulator/venue";
import { stockService } from "@/backend/services/stocks";
import { capacityService } from "@/backend/services/treasury/capacity";
import { tradeService } from "@/backend/services/trades";
import { CHAINS, type Chain } from "@/backend/services/wallets/chains";
import { walletService } from "@/backend/services/wallets";
import { sha256Hex } from "@/utils";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@/utils/exceptions";
import { ngnToUsd, rateToDto } from "@/utils/money";

import { reduceRate, toWithdrawalDto, type WithdrawalDto, type WithdrawalQuoteDto } from "./dto";

export type WithdrawalQuoteBody = { ngn_amount: bigint; stock_id?: string };

class WithdrawalService {
  async quote(userId: string, body: WithdrawalQuoteBody): Promise<WithdrawalQuoteDto> {
    await controlsService.assertOpen("payouts", "PAYOUTS_PAUSED");
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.kycStatus !== "verified") {
      throw new ForbiddenException("KYC verification required", "KYC_REQUIRED");
    }
    const bank = await bankAccountService.getActiveRow(userId);
    if (!bank) {
      throw new ForbiddenException(
        "A verified bank account is required",
        "BANK_ACCOUNT_REQUIRED",
      );
    }
    const provider = await rampRegistry.selectForNewOrder("out");
    const providerQuote = await provider.quote("out", body.ngn_amount);
    const net = body.ngn_amount - providerQuote.feeNgn;
    if (net <= 0n) {
      throw new UnprocessableEntityException("Net amount is zero or negative", "BELOW_MINIMUM");
    }
    const debitUsdc = ngnToUsd(body.ngn_amount, providerQuote.rate, "ceil");
    const chain = (body.stock_id ? (await db.stock.findUnique({ where: { id: body.stock_id } }))?.chain : null) ?? policy.defaultChain;

    let stockId: string | null = null;
    let sellQuantity: bigint | null = null;
    if (body.stock_id) {
      const stock = await stockService.get(body.stock_id);
      stockId = stock.id;
      const withSlippage = (debitUsdc * (10_000n + BigInt(policy.trading.maxSlippageBps))) / 10_000n;
      const exact = await simulatedVenue.quoteExactOut({
        stock,
        side: "sell",
        amountOut: withSlippage,
      });
      sellQuantity = exact.amountIn;
      const holding = await ledgerService.balance(acct.userStock(userId, stock.id));
      if (holding < sellQuantity) {
        throw new ConflictException("Insufficient stock holding", "INSUFFICIENT_FUNDS");
      }
    } else {
      const cash = await ledgerService.balance(acct.userCash(userId, chain));
      if (cash < debitUsdc) {
        throw new ConflictException("Insufficient funds", "INSUFFICIENT_FUNDS");
      }
    }

    const quote = await db.withdrawalQuote.create({
      data: {
        userId,
        provider: provider.id,
        providerMode: provider.mode,
        ngnAmount: body.ngn_amount,
        feeNgn: providerQuote.feeNgn,
        netNgn: net,
        usdAmount: providerQuote.usdAmount,
        debitUsdc,
        rateKobo: providerQuote.rate.kobo,
        rateMicroUsd: providerQuote.rate.microUsd,
        chain,
        stockId,
        sellQuantity,
        bankAccountId: bank.id,
        expiresAt: new Date(now().getTime() + policy.withdrawals.quoteTtlSeconds * 1_000),
      },
    });
    const bankDto = await bankAccountService.getActive(userId);
    return {
      id: quote.id,
      ngn_amount: quote.ngnAmount.toString(),
      fee_ngn: quote.feeNgn.toString(),
      net_ngn: quote.netNgn.toString(),
      debit_usdc: quote.debitUsdc.toString(),
      rate: rateToDto(reduceRate({ kobo: quote.rateKobo, microUsd: quote.rateMicroUsd })),
      stock_id: stockId,
      sell_quantity: sellQuantity?.toString() ?? null,
      bank_account: bankDto!,
      expires_at: quote.expiresAt.toISOString(),
    };
  }

  async confirm(
    userId: string,
    quoteId: string,
    idempotencyKey: string,
  ): Promise<{ withdrawal: WithdrawalDto; created: boolean }> {
    const key = `withdrawal:${userId}:${idempotencyKey}`;
    const requestHash = sha256Hex(quoteId);
    const existing = await db.rampOrder.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          "Idempotency key reused with a different quote",
          "IDEMPOTENCY_KEY_REUSED",
        );
      }
      return { withdrawal: await toWithdrawalDto(existing), created: false };
    }
    const quote = await db.withdrawalQuote.findUnique({ where: { id: quoteId } });
    if (quote?.userId !== userId) {
      throw new NotFoundException("Quote not found");
    }
    if (quote.expiresAt <= now()) {
      throw new ConflictException("Quote expired", "QUOTE_EXPIRED");
    }
    if (quote.consumedAt) {
      throw new ConflictException("Quote already consumed", "QUOTE_CONSUMED");
    }
    const provider = rampRegistry.get(quote.provider);
    if (provider.settlementModel !== "direct_chain") {
      const available = await capacityService.floatAvailable(quote.provider);
      if (available < quote.usdAmount) {
        await alertService.raise(db, {
          kind: "float.short",
          severity: "critical",
          dedupeKey: `float.short:${quote.provider}`,
          message: `Float short for ${quote.provider}`,
          context: { provider: quote.provider },
        });
        throw new ServiceUnavailableException(
          "Provider float is unavailable",
          "FLOAT_UNAVAILABLE",
        );
      }
    }
    const created = await withTx(async (tx) => {
      await complianceService.assertCanTransact(tx, {
        userId,
        direction: "out",
        ngnAmount: quote.ngnAmount,
        usdAmount: quote.debitUsdc,
        at: now(),
      });
      const bank = await tx.bankAccount.findUniqueOrThrow({
        where: { id: quote.bankAccountId },
      });
      const order = await tx.rampOrder.create({
        data: {
          userId,
          kind: "withdrawal",
          direction: "out",
          provider: quote.provider,
          providerMode: quote.providerMode,
          settlementModel: provider.settlementModel,
          status: "created",
          idempotencyKey: key,
          requestHash,
          ngnAmount: quote.ngnAmount,
          feeNgn: quote.feeNgn,
          usdAmount: quote.usdAmount,
          debitUsdc: quote.debitUsdc,
          netNgn: quote.netNgn,
          rateKobo: quote.rateKobo,
          rateMicroUsd: quote.rateMicroUsd,
          chain: quote.chain,
          stockId: quote.stockId,
          quoteId: quote.id,
          sourceBankAccountId: bank.id,
          destBankCode: bank.bankCode,
          destBankName: bank.bankName,
          destAccountNumber: bank.accountNumber,
          destAccountName: bank.resolvedName,
        },
      });
      if (quote.stockId && quote.sellQuantity !== null) {
        await tradeService.createSell(tx, {
          key: `withdrawal-sell:${order.id}`,
          userId,
          stockId: quote.stockId,
          quantity: quote.sellQuantity,
          minAmountOut: quote.debitUsdc,
          orderId: order.id,
        });
      } else {
        await ledgerService.post(
          tx,
          cashReserved({
            key: `order:${order.id}`,
            userId,
            chain: quote.chain,
            amount: quote.debitUsdc,
            from: "cash",
          }),
        );
      }
      await tx.withdrawalQuote.update({
        where: { id: quote.id },
        data: { consumedAt: now() },
      });
      await jobService.enqueue(tx, { kind: "payout.progress", subjectId: order.id });
      return order;
    });
    return { withdrawal: await toWithdrawalDto(created), created: true };
  }

  async createEarningsPayout(
    tx: Tx,
    i: {
      userId: string;
      week: string;
      earningIds: string[];
      amountUsdc: bigint;
      quote: Quote;
    },
  ): Promise<RampOrder> {
    const key = `earnings:${i.userId}:${i.week}`;
    const existing = await tx.rampOrder.findUnique({ where: { idempotencyKey: key } });
    if (existing) return existing;
    const bank = await tx.bankAccount.findFirstOrThrow({
      where: { userId: i.userId, status: "active" },
    });
    const chain = policy.defaultChain;
    const debitUsdc = ngnToUsd(i.quote.ngnAmount, i.quote.rate, "ceil");
    const order = await tx.rampOrder.create({
      data: {
        userId: i.userId,
        kind: "earnings_payout",
        direction: "out",
        provider: i.quote.provider,
        providerMode: "simulated",
        settlementModel: rampRegistry.get(i.quote.provider).settlementModel,
        status: "created",
        idempotencyKey: key,
        requestHash: `earnings:${i.week}`,
        ngnAmount: i.quote.ngnAmount,
        feeNgn: i.quote.feeNgn,
        usdAmount: i.quote.usdAmount,
        debitUsdc,
        netNgn: i.quote.ngnAmount - i.quote.feeNgn,
        rateKobo: i.quote.rate.kobo,
        rateMicroUsd: i.quote.rate.microUsd,
        chain,
        sourceBankAccountId: bank.id,
        destBankCode: bank.bankCode,
        destBankName: bank.bankName,
        destAccountNumber: bank.accountNumber,
        destAccountName: bank.resolvedName,
      },
    });
    await ledgerService.post(
      tx,
      cashReserved({
        key: `order:${order.id}`,
        userId: i.userId,
        chain,
        amount: debitUsdc,
        from: "earnings",
      }),
    );
    await tx.earning.updateMany({
      where: { id: { in: i.earningIds } },
      data: { payoutOrderId: order.id },
    });
    await jobService.enqueue(tx, { kind: "payout.progress", subjectId: order.id });
    return order;
  }

  async get(userId: string, id: string): Promise<WithdrawalDto> {
    const order = await orderService.getOwned(userId, id, ["withdrawal", "earnings_payout"]);
    return toWithdrawalDto(order);
  }

  private async hold(
    tx: Tx,
    order: RampOrder,
    reason: NonNullable<RampOrder["holdReason"]>,
    alert?: { kind: string; severity: "info" | "warning" | "critical"; message: string },
  ): Promise<void> {
    await orderService.transition(tx, {
      order,
      to: order.status,
      patch: { holdReason: reason },
      actor: "system",
    });
    if (alert) {
      await alertService.raise(tx, {
        kind: alert.kind,
        severity: alert.severity,
        dedupeKey: `${alert.kind}:${order.id}`,
        message: alert.message,
        context: { orderId: order.id, userId: order.userId },
      });
    }
  }

  private async ensureCollectTransfer(tx: Tx, order: RampOrder): Promise<void> {
    const chain = (order.chain ?? policy.defaultChain) as Chain;
    const existing = await tx.chainTransfer.findUnique({ where: { key: `collect:${order.id}` } });
    if (existing) return;
    const amount = order.debitUsdc ?? 0n;
    await walletService.createTransfer(tx, {
      key: `collect:${order.id}`,
      purpose: "payout_collection",
      chain,
      amount,
      from: { kind: "user", userId: order.userId },
      to: { kind: "treasury" },
      orderId: order.id,
    });
  }

  private async ensureReturnTransfer(tx: Tx, order: RampOrder): Promise<"ok" | "short"> {
    const chain = (order.chain ?? policy.defaultChain) as Chain;
    const existing = await tx.chainTransfer.findUnique({ where: { key: `return:${order.id}` } });
    if (existing) return "ok";
    const amount = order.debitUsdc ?? 0n;
    const treasuryAccount = await tx.ledgerAccount.findUnique({
      where: { code: acct.treasury(chain).code },
    });
    if (treasuryAccount) {
      await tx.$queryRawUnsafe(
        `SELECT id FROM "ledger_accounts" WHERE id = $1 FOR UPDATE`,
        treasuryAccount.id,
      );
    }
    const treasuryBalance = await ledgerService.balance(acct.treasury(chain), tx);
    if (treasuryBalance < amount) {
      await this.hold(tx, order, "treasury_short", {
        kind: "treasury.short",
        severity: "critical",
        message: `Treasury short on ${chain} for payout return ${order.id}`,
      });
      return "short";
    }
    await walletService.createTransfer(tx, {
      key: `return:${order.id}`,
      purpose: "payout_return",
      chain,
      amount,
      from: { kind: "treasury" },
      to: { kind: "user", userId: order.userId },
      orderId: order.id,
    });
    return "ok";
  }

  private async ensureDirectPayout(tx: Tx, order: RampOrder): Promise<void> {
    const chain = (order.chain ?? policy.defaultChain) as Chain;
    const provider = rampRegistry.forOrder(order);
    const existing = await provider.findByKey("out", order.id);
    if (!existing && !order.providerRef) {
      const quote = await provider.quote("out", order.ngnAmount);
      const bank = await tx.bankAccount.findUniqueOrThrow({
        where: { id: order.sourceBankAccountId! },
      });
      const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
      const maxUsd =
        ((order.usdAmount ?? 0n) * (10_000n + BigInt(policy.withdrawals.fxDriftBps))) / 10_000n;
      try {
        const result = await provider.createPayout({
          quote,
          destination: {
            bankCode: bank.bankCode,
            accountNumber: bank.accountNumber,
            accountName: bank.resolvedName,
          },
          customer: customerFor(user),
          key: order.id,
          maxUsd,
          chain,
        });
        const funding = result.funding;
        if (funding.kind !== "chain") {
          throw new RetryableError("DIRECT_FUNDING_REQUIRED");
        }
        await orderService.transition(tx, {
          order,
          to: "created",
          patch: {
            providerRef: result.ref,
            fundingAddress: funding.address,
            fundingAmount: funding.amount,
            lockedUsd: result.locked.usdAmount,
          },
          actor: "system",
        });
      } catch (error) {
        if (error instanceof ProviderError && error.kind === "transient") {
          throw new RetryableError(error.code);
        }
        if (error instanceof ProviderError && error.kind === "duplicate") {
          const fundingAddress = paycrestFundingAddress(chain, order.id);
          await orderService.transition(tx, {
            order,
            to: "created",
            patch: {
              providerRef: refForKey(order.id),
              fundingAddress,
              fundingAmount: order.debitUsdc ?? 0n,
              lockedUsd: order.usdAmount ?? 0n,
            },
            actor: "system",
          });
        } else {
          throw error;
        }
      }
    }
    const reloaded = await tx.rampOrder.findUniqueOrThrow({ where: { id: order.id } });
    if (!reloaded.fundingAddress || !reloaded.fundingAmount) return;
    const existingTransfer = await tx.chainTransfer.findUnique({
      where: { key: `collect:${order.id}` },
    });
    if (existingTransfer) return;
    await walletService.createTransfer(tx, {
      key: `collect:${order.id}`,
      purpose: "direct_payout_funding",
      chain,
      amount: reloaded.fundingAmount,
      from: { kind: "user", userId: order.userId },
      to: { kind: "external", address: reloaded.fundingAddress },
      orderId: order.id,
    });
  }

  async progress(orderId: string): Promise<void> {
    const retry: { code?: string; delayMs?: number } = {};
    await withTx(async (tx) => {
      const order = await orderService.loadForUpdate(tx, orderId);
      if (order.kind !== "withdrawal" && order.kind !== "earnings_payout") return;
      if (["paid", "failed", "refunded", "settled"].includes(order.status)) return;

      if (order.status === "created") {
        if (order.stockId) {
          const trade = await tx.tradeOrder.findUnique({
            where: { key: `withdrawal-sell:${order.id}` },
          });
          if (!trade) return;
          if (trade.status === "pending" || trade.status === "submitted") return;
          if (trade.status === "failed") {
            await orderService.transition(tx, {
              order,
              to: "failed",
              patch: { failureReason: "SELL_FAILED" },
              actor: "system",
            });
            return;
          }
          const chain = (order.chain ?? policy.defaultChain) as Chain;
          const reserved = await tx.ledgerJournal.findUnique({
            where: { key: `order:${order.id}:reserve` },
          });
          if (!reserved) {
            await ledgerService.post(
              tx,
              cashReserved({
                key: `order:${order.id}`,
                userId: order.userId,
                chain,
                amount: order.debitUsdc ?? 0n,
                from: "cash",
              }),
            );
          }
        }
        if (order.settlementModel === "direct_chain") {
          await this.ensureDirectPayout(tx, order);
          return;
        }
        await this.ensureCollectTransfer(tx, order);
        return;
      }

      if (order.status === "funds_collected") {
        if (await controlsService.isPaused("payouts", tx)) {
          await this.hold(tx, order, "paused");
          retry.code = "PAYOUTS_PAUSED";
          retry.delayMs = 600_000;
          return;
        }
        const provider = rampRegistry.forOrder(order);
        const existing = await provider.findByKey("out", order.id);
        let ref: string | null = existing?.ref ?? null;
        let lockedUsd: bigint = existing?.usdAmount ?? order.usdAmount ?? 0n;
        if (!existing) {
          const quote = await provider.quote("out", order.ngnAmount);
          const bank = await tx.bankAccount.findUniqueOrThrow({
            where: { id: order.sourceBankAccountId! },
          });
          const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
          const maxUsd =
            ((order.usdAmount ?? 0n) * (10_000n + BigInt(policy.withdrawals.fxDriftBps))) / 10_000n;
          try {
            const result = await provider.createPayout({
              quote,
              destination: {
                bankCode: bank.bankCode,
                accountNumber: bank.accountNumber,
                accountName: bank.resolvedName,
              },
              customer: customerFor(user),
              key: order.id,
              maxUsd,
            });
            ref = result.ref;
            lockedUsd = result.locked.usdAmount;
          } catch (error) {
            if (error instanceof ProviderError && error.kind === "rate_moved") {
              await this.hold(tx, order, "rate_moved");
              retry.code = "RATE_MOVED";
              retry.delayMs = 900_000;
              return;
            }
            if (error instanceof ProviderError && error.kind === "transient") {
              throw new RetryableError(error.code);
            }
            if (error instanceof ProviderError && error.kind === "duplicate") {
              const adopted = await provider.findByKey("out", order.id);
              if (!adopted) throw error;
              ref = adopted.ref;
              lockedUsd = adopted.usdAmount ?? order.usdAmount ?? 0n;
            } else {
              throw error;
            }
          }
        }
        if (!ref) return;
        await orderService.transition(tx, {
          order,
          to: "submitted",
          patch: { providerRef: ref, lockedUsd },
          journals:
            order.settlementModel === "direct_chain"
              ? []
              : [
                  payoutSubmitted({
                    orderId: order.id,
                    provider: order.provider,
                    usd: lockedUsd,
                  }),
                ],
          actor: "system",
        });
        return;
      }

      if (order.status === "submitted") {
        if (!order.providerRef) return;
        const provider = rampRegistry.forOrder(order);
        let txState;
        try {
          txState = await provider.getTransaction("out", order.providerRef);
        } catch (error) {
          if (error instanceof ProviderError && error.kind === "not_found") return;
          if (error instanceof ProviderError && error.kind === "transient") {
            throw new RetryableError(error.code);
          }
          throw error;
        }
        if (txState.state === "pending" || txState.state === "refunding") return;
        if (txState.state === "hold") {
          await this.hold(tx, order, "needs_review", {
            kind: "payout.hold",
            severity: "warning",
            message: `Payout ${order.id} held by provider`,
          });
          return;
        }
        if (txState.state === "complete") {
          await orderService.transition(tx, {
            order,
            to: "paid",
            patch: { bankReference: txState.bankReference },
            journals:
              order.settlementModel === "direct_chain"
                ? []
                : [
                    payoutPaid({
                      orderId: order.id,
                      provider: order.provider,
                      usd: order.lockedUsd ?? txState.usdAmount ?? 0n,
                    }),
                  ],
            actor: "system",
          });
          return;
        }
        if (txState.state === "refunded" && order.settlementModel === "direct_chain") {
          const settle = txState.chainSettlement;
          if (!settle) return;
          const chain = (order.chain ?? policy.defaultChain) as Chain;
          const wallet = await tx.wallet.findUnique({
            where: { userId_family: { userId: order.userId, family: CHAINS[chain].family } },
          });
          if (!wallet) {
            throw new RetryableError("WALLET_NOT_READY");
          }
          const observed = await walletService.observeIncoming(chain, settle.txHash, {
            to: wallet.address,
            amount: settle.amount,
          });
          if (observed !== "confirmed") return;
          await orderService.transition(tx, {
            order,
            to: "reversed",
            journals: [
              directPayoutRefunded({
                orderId: order.id,
                provider: order.provider,
                userId: order.userId,
                chain,
                amount: settle.amount,
                to: order.kind === "earnings_payout" ? "earnings" : "cash",
              }),
            ],
            actor: "system",
          });
          return;
        }
        if (txState.state === "failed" && order.settlementModel === "direct_chain") {
          const chain = (order.chain ?? policy.defaultChain) as Chain;
          await orderService.transition(tx, {
            order,
            to: "reversed",
            patch: { failureReason: txState.failureCode ?? "PAYOUT_FAILED" },
            journals: [
              directPayoutRefunded({
                orderId: order.id,
                provider: order.provider,
                userId: order.userId,
                chain,
                amount: order.lockedUsd ?? txState.usdAmount ?? 0n,
                to: order.kind === "earnings_payout" ? "earnings" : "cash",
              }),
            ],
            actor: "system",
          });
          return;
        }
        if (txState.state === "failed") {
          await orderService.transition(tx, {
            order,
            to: "reversed",
            patch: { failureReason: txState.failureCode ?? "PAYOUT_FAILED" },
            journals: [
              payoutRejected({
                orderId: order.id,
                provider: order.provider,
                usd: order.lockedUsd ?? txState.usdAmount ?? 0n,
                userId: order.userId,
                debitUsdc: order.debitUsdc ?? 0n,
              }),
            ],
            actor: "system",
          });
          return;
        }
        return;
      }

      if (order.status === "reversed") {
        if (order.settlementModel === "direct_chain") return;
        const result = await this.ensureReturnTransfer(tx, order);
        if (result === "short") {
          retry.code = "TREASURY_SHORT";
          retry.delayMs = 300_000;
          return;
        }
      }
    });
    if (retry.code) {
      throw new RetryableError(retry.code, retry.delayMs);
    }
  }

  async onCollectionSettled(t: ChainTransfer): Promise<void> {
    const orderId = t.orderId;
    if (!orderId) return;
    await withTx(async (tx) => {
      const order = await orderService.loadForUpdate(tx, orderId);
      if (order.kind !== "withdrawal" && order.kind !== "earnings_payout") return;
      if (t.status === "confirmed") {
        if (order.status !== "created") return;
        await ledgerService.post(
          tx,
          payoutCollected({
            id: t.id,
            userId: order.userId,
            chain: t.chain,
            amount: t.amount,
          }),
        );
        await orderService.transition(tx, {
          order,
          to: "funds_collected",
          patch: { holdReason: null },
          jobs: [{ kind: "payout.progress", subjectId: order.id }],
          actor: "system",
        });
        return;
      }
      if (t.status === "failed") {
        const to = order.kind === "earnings_payout" ? "earnings" : "cash";
        await ledgerService.post(
          tx,
          cashReleased({
            key: `order:${order.id}`,
            userId: order.userId,
            chain: t.chain,
            amount: t.amount,
            to,
          }),
        );
        await tx.earning.updateMany({
          where: { payoutOrderId: order.id },
          data: { payoutOrderId: null },
        });
        await orderService.transition(tx, {
          order,
          to: "failed",
          patch: { failureReason: t.failureReason ?? "COLLECTION_FAILED" },
          actor: "system",
        });
      }
    });
  }

  async onDirectFundingSettled(t: ChainTransfer): Promise<void> {
    const orderId = t.orderId;
    if (!orderId) return;
    await withTx(async (tx) => {
      const order = await orderService.loadForUpdate(tx, orderId);
      if (order.kind !== "withdrawal" && order.kind !== "earnings_payout") return;
      if (order.settlementModel !== "direct_chain") return;
      if (t.status === "confirmed") {
        if (order.status !== "created") return;
        await ledgerService.post(
          tx,
          directPayoutCollected({
            id: t.id,
            provider: order.provider,
            userId: order.userId,
            chain: t.chain,
            amount: t.amount,
          }),
        );
        await orderService.transition(tx, {
          order,
          to: "funds_collected",
          patch: { holdReason: null },
          jobs: [{ kind: "payout.progress", subjectId: order.id }],
          actor: "system",
        });
        return;
      }
      if (t.status === "failed") {
        const to = order.kind === "earnings_payout" ? "earnings" : "cash";
        await ledgerService.post(
          tx,
          cashReleased({
            key: `order:${order.id}`,
            userId: order.userId,
            chain: t.chain,
            amount: t.amount,
            to,
          }),
        );
        await tx.earning.updateMany({
          where: { payoutOrderId: order.id },
          data: { payoutOrderId: null },
        });
        await orderService.transition(tx, {
          order,
          to: "failed",
          patch: { failureReason: t.failureReason ?? "FUNDING_FAILED" },
          actor: "system",
        });
      }
    });
  }

  async onReturnSettled(t: ChainTransfer): Promise<void> {
    const orderId = t.orderId;
    if (!orderId) return;
    if (t.status !== "confirmed") return;
    await withTx(async (tx) => {
      const order = await orderService.loadForUpdate(tx, orderId);
      if (order.kind !== "withdrawal" && order.kind !== "earnings_payout") return;
      await ledgerService.post(
        tx,
        userFunded({
          id: t.id,
          userId: order.userId,
          chain: t.chain,
          amount: t.amount,
          to: order.kind === "earnings_payout" ? "earnings" : "cash",
        }),
      );
      if (order.kind === "earnings_payout") {
        await tx.earning.updateMany({
          where: { payoutOrderId: order.id },
          data: { payoutOrderId: null },
        });
      }
    });
  }

  async onSellSettled(t: TradeOrder): Promise<void> {
    const orderId = t.orderId;
    if (!orderId) return;
    await jobService.enqueue(db, { kind: "payout.progress", subjectId: orderId });
  }
}

export const withdrawalService = new WithdrawalService();
