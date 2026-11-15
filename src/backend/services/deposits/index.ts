import type { ChainTransfer, RampOrder, TradeOrder } from "@/server/prisma";
import { db, withTx, type Tx } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { alertService } from "@/backend/services/alerts";
import { bankAccountService } from "@/backend/services/bank-accounts";
import { complianceService, customerFor } from "@/backend/services/compliance";
import { nameMatches } from "@/backend/services/compliance/name-match";
import { jobService } from "@/backend/services/jobs";
import { controlsService } from "@/backend/services/controls";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import {
  depositReceived,
  depositReceivedDirect,
  transferReleased,
  userFunded,
} from "@/backend/services/ledger/postings";
import { orderService } from "@/backend/services/orders";
import { ProviderError } from "@/backend/services/ramp/errors";
import { rampRegistry } from "@/backend/services/ramp";
import { ratesService } from "@/backend/services/rates";
import { RetryableError } from "@/backend/services/jobs/types";
import { stockService } from "@/backend/services/stocks";
import { tradeService } from "@/backend/services/trades";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { CHAINS, type Chain } from "@/backend/services/wallets/chains";
import type { Chain as RampChain } from "@/backend/services/ramp/types";
import { walletService } from "@/backend/services/wallets";
import { canonicalJson, sha256Hex } from "@/utils";
import { fromDbRaw } from "@/utils/asset-units";
import { ConflictException, ForbiddenException } from "@/utils/exceptions";
import { ngnToUsd } from "@/utils/money";

import { toDepositDto, type DepositDto } from "./dto";

export type DepositBody = { ngn_amount: bigint; stock_id?: string };

class DepositService {
  async create(
    userId: string,
    body: DepositBody,
    idempotencyKey: string,
  ): Promise<{ deposit: DepositDto; created: boolean }> {
    await controlsService.assertOpen("deposits", "DEPOSITS_PAUSED");
    const stock = body.stock_id ? await stockService.get(body.stock_id) : null;
    const bankAccount = await bankAccountService.getActiveRow(userId);
    if (!bankAccount) {
      throw new ForbiddenException(
        "A verified bank account is required",
        "BANK_ACCOUNT_REQUIRED",
      );
    }
    const provider = await rampRegistry.selectForNewOrder("in");
    const display = await ratesService.display();
    const estimatedUsd = ngnToUsd(body.ngn_amount, display.depositRate, "floor");
    const key = `deposit:${userId}:${idempotencyKey}`;
    const requestHash = sha256Hex(
      canonicalJson({
        ngn_amount: body.ngn_amount.toString(),
        stock_id: body.stock_id ?? null,
      }),
    );
    const created = await withTx(async (tx) => {
      const existing = await tx.rampOrder.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException(
            "Idempotency key reused with a different body",
            "IDEMPOTENCY_KEY_REUSED",
          );
        }
        return { order: existing, created: false };
      }
      await complianceService.assertCanTransact(tx, {
        userId,
        direction: "in",
        ngnAmount: body.ngn_amount,
        usdAmount: estimatedUsd,
        at: now(),
      });
      const order = await tx.rampOrder.create({
        data: {
          userId,
          kind: "deposit",
          direction: "in",
          provider: provider.id,
          providerMode: provider.mode,
          settlementModel: provider.settlementModel,
          status: "created",
          idempotencyKey: key,
          requestHash,
          ngnAmount: body.ngn_amount,
          chain: stock?.chain ?? policy.defaultChain,
          stockId: stock?.id ?? null,
        },
      });
      await jobService.enqueue(tx, {
        kind: "deposit.progress",
        subjectId: order.id,
        runAt: new Date(now().getTime() + 15_000),
      });
      return { order, created: true };
    });
    if (created.created) {
      await Promise.race([
        this.progress(created.order.id).catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 8_000)),
      ]);
    }
    const order = await db.rampOrder.findUniqueOrThrow({ where: { id: created.order.id } });
    const trade = await db.tradeOrder.findFirst({ where: { orderId: order.id } });
    return { deposit: toDepositDto(order, trade), created: created.created };
  }

  async get(userId: string, id: string): Promise<DepositDto> {
    const order = await orderService.getOwned(userId, id, ["deposit"]);
    const trade = await db.tradeOrder.findFirst({ where: { orderId: order.id } });
    return toDepositDto(order, trade);
  }

  private async hold(
    tx: Tx,
    order: RampOrder,
    reason: NonNullable<RampOrder["holdReason"]>,
    alert: { kind: string; severity: "info" | "warning" | "critical"; message: string },
  ): Promise<void> {
    await orderService.transition(tx, {
      order,
      to: order.status,
      patch: { holdReason: reason },
      actor: "system",
    });
    await alertService.raise(tx, {
      kind: alert.kind,
      severity: alert.severity,
      dedupeKey: `${alert.kind}:${order.id}`,
      message: alert.message,
      context: { orderId: order.id, userId: order.userId },
    });
  }

  async progress(orderId: string): Promise<void> {
    const retry: { code?: string; delayMs?: number } = {};
    await withTx(async (tx) => {
      const order = await orderService.loadForUpdate(tx, orderId);
      if (order.kind !== "deposit") return;
      if (
        order.status === "settled" ||
        order.status === "failed" ||
        order.status === "refunded" ||
        order.status === "funded"
      ) {
        return;
      }
      const provider = rampRegistry.forOrder(order);
      if (order.status === "created") {
        const existing = await provider.findByKey("in", order.id);
        let collection: Awaited<ReturnType<typeof provider.createCollection>> | null = null;
        let ref: string | null = existing?.ref ?? null;
        if (!existing) {
          const quote = await provider.quote("in", order.ngnAmount);
          const bank = await tx.bankAccount.findFirstOrThrow({
            where: { userId: order.userId, status: "active" },
          });
          const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
          let recipient: { chain: RampChain; address: string } | null = null;
          if (order.settlementModel === "direct_chain") {
            const chain = (order.chain ?? policy.defaultChain) as Chain;
            const wallet = await tx.wallet.findUnique({
              where: { userId_family: { userId: order.userId, family: CHAINS[chain].family } },
            });
            if (!wallet) {
              throw new RetryableError("WALLET_NOT_READY");
            }
            recipient = { chain: chain as RampChain, address: wallet.address };
          }
          try {
            collection = await provider.createCollection({
              quote,
              customer: customerFor(user),
              source: {
                bankCode: bank.bankCode,
                accountNumber: bank.accountNumber,
                accountName: bank.resolvedName,
              },
              key: order.id,
              recipient,
            });
            ref = collection.ref;
          } catch (error) {
            if (error instanceof ProviderError && error.kind === "duplicate") {
              const adopted = await provider.findByKey("in", order.id);
              ref = adopted?.ref ?? null;
            } else if (error instanceof ProviderError && error.kind === "rejected") {
              await orderService.transition(tx, {
                order,
                to: "failed",
                patch: { failureReason: error.code },
                actor: "system",
              });
              return;
            } else if (error instanceof ProviderError && error.kind === "transient") {
              throw new RetryableError(error.code);
            } else {
              throw error;
            }
          }
        }
        if (!ref) return;
        const locked =
          collection?.locked ??
          (await provider.quote("in", order.ngnAmount));
        await orderService.transition(tx, {
          order,
          to: "awaiting_transfer",
          patch: {
            providerRef: ref,
            payToBankName: collection?.bankName ?? null,
            payToAccountNumber: collection?.accountNumber ?? null,
            payToAccountName: collection?.accountName ?? null,
            payToReference: collection?.reference ?? null,
            feeNgn: locked.feeNgn,
            usdAmount: locked.usdAmount,
            rateKobo: locked.rate.kobo,
            rateMicroUsd: locked.rate.microUsd,
            expiresAt: collection?.expiresAt ?? locked.expiresAt,
          },
          actor: "system",
        });
        return;
      }

      if (order.status === "awaiting_transfer" || order.status === "expired") {
        if (!order.providerRef) return;
        let txState;
        try {
          txState = await provider.getTransaction("in", order.providerRef);
        } catch (error) {
          if (error instanceof ProviderError && error.kind === "not_found") return;
          if (error instanceof ProviderError && error.kind === "transient") {
            throw new RetryableError(error.code);
          }
          throw error;
        }
        if (txState.state === "pending" || txState.state === "refunding") return;
        if (txState.state === "failed") {
          await orderService.transition(tx, {
            order,
            to: "failed",
            patch: { failureReason: txState.failureCode ?? "FAILED" },
            actor: "system",
          });
          return;
        }
        if (txState.state === "expired") {
          await orderService.transition(tx, {
            order,
            to: "expired",
            actor: "system",
            jobs: [{ kind: "deposit.progress", subjectId: order.id }],
          });
          return;
        }
        if (txState.state === "refunded") {
          await orderService.transition(tx, { order, to: "refunded", actor: "system" });
          return;
        }
        if (txState.state === "hold") {
          await this.hold(tx, order, "needs_review", {
            kind: "deposit.hold",
            severity: "warning",
            message: `Deposit ${order.id} held by provider`,
          });
          return;
        }
        if (txState.state !== "complete") return;
        if (order.settlementModel === "direct_chain") {
          const settle = txState.chainSettlement;
          if (!settle) {
            await this.hold(tx, order, "needs_review", {
              kind: "deposit.settlement_missing",
              severity: "critical",
              message: `Deposit ${order.id} completed without a chain settlement`,
            });
            return;
          }
          const settleChain = settle.chain;
          const wallet = await tx.wallet.findUnique({
            where: {
              userId_family: { userId: order.userId, family: CHAINS[settleChain].family },
            },
          });
          if (!wallet) {
            throw new RetryableError("WALLET_NOT_READY");
          }
          const observed = await walletService.observeIncoming(settleChain, settle.txHash, {
            to: wallet.address,
            amount: settle.amount,
          });
          if (observed === "pending") return;
          if (observed === "mismatch") {
            await this.hold(tx, order, "needs_review", {
              kind: "deposit.settlement_mismatch",
              severity: "critical",
              message: `Deposit ${order.id} chain settlement mismatch`,
            });
            return;
          }
          let current = await orderService.transition(tx, {
            order,
            to: "received",
            patch: {
              receivedNgn: txState.ngnAmount ?? order.ngnAmount,
              usdAmount: settle.amount,
              holdReason: null,
            },
            journals: [
              depositReceivedDirect({
                orderId: order.id,
                provider: order.provider,
                userId: order.userId,
                chain: settleChain,
                amount: settle.amount,
              }),
            ],
            jobs: [{ kind: "deposit.progress", subjectId: order.id }],
            actor: "system",
          });
          current = await orderService.transition(tx, {
            order: current,
            to: "funded",
            patch: { holdReason: null },
            actor: "system",
          });
          // Deposit completion funds the user's testnet execution account through a
          // real local transfer, exactly once per order.
          if (!current.onchainFundedAt) {
            const fundedHash = await testnetWalletService.fundExecutionAccountOnce(
              current.userId,
              BigInt(settle.amount),
            );
            if (fundedHash) {
              await tx.rampOrder.update({
                where: { id: current.id },
                data: { onchainFundedAt: now() },
              });
            }
          }
          if (order.stockId) {
            await tradeService.createBuy(tx, {
              key: `deposit-buy:${order.id}`,
              userId: order.userId,
              purpose: "deposit_buy",
              fundsSource: "cash",
              amountIn: settle.amount,
              stockId: order.stockId,
              orderId: order.id,
            });
          } else {
            await orderService.transition(tx, { order: current, to: "settled", actor: "system" });
          }
          return;
        }
        const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
        const received = txState.ngnAmount ?? order.ngnAmount;
        if (!txState.senderName) {
          await this.hold(tx, order, "missing_sender", {
            kind: "deposit.hold",
            severity: "warning",
            message: `Deposit ${order.id} missing sender name`,
          });
          return;
        }
        if (!user.verifiedName || !nameMatches(user.verifiedName, txState.senderName)) {
          await this.hold(tx, order, "name_mismatch", {
            kind: "deposit.name_mismatch",
            severity: "critical",
            message: `Deposit ${order.id} sender name mismatch`,
          });
          await provider.refundCollection(order.providerRef);
          return;
        }
        const drift = received > order.ngnAmount ? received - order.ngnAmount : order.ngnAmount - received;
        if (drift * 10_000n > order.ngnAmount * BigInt(policy.deposits.toleranceBps)) {
          await this.hold(tx, order, "amount_mismatch", {
            kind: "deposit.amount_mismatch",
            severity: "critical",
            message: `Deposit ${order.id} amount mismatch`,
          });
          await provider.refundCollection(order.providerRef);
          return;
        }
        const usd = txState.usdAmount ?? order.usdAmount ?? 0n;
        await orderService.transition(tx, {
          order,
          to: "received",
          patch: { receivedNgn: received, usdAmount: usd, holdReason: null },
          journals: [
            depositReceived({
              orderId: order.id,
              provider: order.provider,
              userId: order.userId,
              usd,
            }),
          ],
          jobs: [{ kind: "deposit.progress", subjectId: order.id }],
          actor: "system",
        });
        return;
      }

      if (order.status === "received") {
        const chain = (order.chain ?? policy.defaultChain) as Chain;
        const existing = await tx.chainTransfer.findUnique({
          where: { key: `fund:${order.id}` },
        });
        if (existing) {
          if (order.holdReason === "treasury_short") {
            await orderService.transition(tx, {
              order,
              to: "received",
              patch: { holdReason: null },
              actor: "system",
            });
          }
          return;
        }
        const family = CHAINS[chain]?.family ?? "evm";
        const wallet = await tx.wallet.findUnique({
          where: { userId_family: { userId: order.userId, family } },
        });
        if (!wallet) {
          throw new RetryableError("WALLET_NOT_READY");
        }
        const amount = order.usdAmount ?? 0n;
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
            message: `Treasury short on ${chain} for deposit ${order.id}`,
          });
          retry.code = "TREASURY_SHORT";
          retry.delayMs = 300_000;
          return;
        }
        await walletService.createTransfer(tx, {
          key: `fund:${order.id}`,
          purpose: "deposit_funding",
          chain,
          amount,
          from: { kind: "treasury" },
          to: { kind: "user", userId: order.userId },
          orderId: order.id,
        });
      }
    });
    if (retry.code) {
      throw new RetryableError(retry.code, retry.delayMs);
    }
  }

  async onFundingSettled(t: ChainTransfer): Promise<void> {
    const orderId = t.orderId;
    if (!orderId) return;
    await withTx(async (tx) => {
      const order = await orderService.loadForUpdate(tx, orderId);
      if (order.kind !== "deposit") return;
      if (t.status === "confirmed") {
        if (order.status !== "received") return;
        await ledgerService.post(
          tx,
          userFunded({ id: t.id, userId: order.userId, chain: t.chain, amount: fromDbRaw(t.amount), to: "cash" }),
        );
        if (order.stockId) {
          await tradeService.createBuy(tx, {
            key: `deposit-buy:${order.id}`,
            userId: order.userId,
            purpose: "deposit_buy",
            fundsSource: "cash",
            amountIn: order.usdAmount ?? fromDbRaw(t.amount),
            stockId: order.stockId,
            orderId: order.id,
          });
          await orderService.transition(tx, {
            order,
            to: "funded",
            patch: { holdReason: null },
            actor: "system",
          });
        } else {
          const funded = await orderService.transition(tx, {
            order,
            to: "funded",
            patch: { holdReason: null },
            actor: "system",
          });
          await orderService.transition(tx, { order: funded, to: "settled", actor: "system" });
        }
        return;
      }
      if (t.status === "failed") {
        await ledgerService.post(
          tx,
          transferReleased({ id: t.id, chain: t.chain, amount: fromDbRaw(t.amount) }),
        );
        await this.hold(tx, order, "needs_review", {
          kind: "deposit.funding_failed",
          severity: "critical",
          message: `Funding transfer failed for deposit ${order.id}`,
        });
      }
    });
  }

  async onBuySettled(t: TradeOrder): Promise<void> {
    const orderId = t.orderId;
    if (!orderId) return;
    await withTx(async (tx) => {
      const order = await orderService.loadForUpdate(tx, orderId);
      if (order.kind !== "deposit" || order.status !== "funded") return;
      await orderService.transition(tx, { order, to: "settled", actor: "system" });
    });
  }

  async requestRefund(orderId: string, actor: string): Promise<void> {
    await withTx(async (tx) => {
      const order = await orderService.loadForUpdate(tx, orderId);
      if (order.kind !== "deposit") return;
      if (order.status !== "awaiting_transfer" && order.status !== "expired") return;
      const provider = rampRegistry.forOrder(order);
      if (order.providerRef) {
        await provider.refundCollection(order.providerRef);
      }
      await orderService.transition(tx, { order, to: "refunded", actor });
    });
  }
}

export const depositService = new DepositService();
