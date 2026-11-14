import { Prisma, type ProviderId, type TreasuryOperation } from "@/server/prisma";
import { db, withTx } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { integrationModes } from "@/backend/integrations/beta-policy";
import { alertService } from "@/backend/services/alerts";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import {
  floatToppedUp,
  floatWithdrawalReceived,
  floatWithdrawalRequested,
  openingBalance,
  transferReleased,
} from "@/backend/services/ledger/postings";
import { jobService } from "@/backend/services/jobs";
import { lagosParts } from "@/backend/services/jobs/schedule";
import { fromDbRaw } from "@/utils/asset-units";
import { rampRegistry } from "@/backend/services/ramp";
import { simChain } from "@/backend/services/simulator/chain";
import { simRamp } from "@/backend/services/simulator/ramp";
import { walletService } from "@/backend/services/wallets";
import type { Chain } from "@/backend/services/wallets/chains";

import { capacityService } from "./capacity";
import { simulatedSettlement, type SettlementProvider } from "./settlement";

const PARTNER_FLOAT_PROVIDERS: readonly ProviderId[] = ["yellowcard"];

class TreasuryService {
  private provider(): SettlementProvider {
    return simulatedSettlement;
  }

  async rebalance(at: Date): Promise<TreasuryOperation[]> {
    const created: TreasuryOperation[] = [];
    const slot = (() => {
      const parts = lagosParts(at);
      return `${parts.isoDate}T${String(parts.hour).padStart(2, "0")}:00`;
    })();
    for (const providerId of PARTNER_FLOAT_PROVIDERS) {
      const provider = rampRegistry.get(providerId);
      if (provider.settlementModel !== "partner_float") continue;
      const balance = await provider.floatBalance();
      if (balance === null) continue;
      const { floorMicroUsd, targetMicroUsd, ceilingMicroUsd } = policy.treasury.float;
      if (provider.mode === "sandbox") {
        await alertService.raise(db, {
          kind: "treasury.manual_rebalance_required",
          severity: "warning",
          dedupeKey: `treasury.manual_rebalance_required:${providerId}`,
          message: `Manual rebalance required for ${providerId} in sandbox mode`,
          context: { provider: providerId, balance: balance.toString() },
        });
        continue;
      }
      const chain = policy.defaultChain as Chain;
      if (balance > ceilingMicroUsd) {
        const amount = balance - targetMicroUsd;
        const op = await this.insertOp({
          key: `rebalance:${providerId}:${slot}`,
          kind: "float_withdrawal",
          provider: providerId,
          chain,
          amountUsd: amount,
        });
        if (op) created.push(op);
      } else if (balance < floorMicroUsd) {
        const wanted = targetMicroUsd - balance;
        const available = await capacityService.treasuryAvailable(chain);
        const amount = wanted < available ? wanted : available;
        if (amount <= 0n) continue;
        const op = await this.insertOp({
          key: `rebalance:${providerId}:${slot}`,
          kind: "float_topup",
          provider: providerId,
          chain,
          amountUsd: amount,
          amountUsdc: amount,
        });
        if (op) created.push(op);
      }
    }
    return created;
  }

  private async insertOp(input: {
    key: string;
    kind: "float_topup" | "float_withdrawal";
    provider: ProviderId;
    chain: string;
    amountUsd: bigint;
    amountUsdc?: bigint;
  }): Promise<TreasuryOperation | null> {
    try {
      const op = await db.treasuryOperation.create({
        data: {
          key: input.key,
          kind: input.kind,
          provider: input.provider,
          chain: input.chain,
          amountUsd: input.amountUsd,
          amountUsdc: input.amountUsdc ?? null,
          status: "planned",
          providerMode: integrationModes().wallets,
        },
      });
      await jobService.enqueue(db, { kind: "treasury.progress", subjectId: op.id });
      return op;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return null;
      }
      throw error;
    }
  }

  async ensureFloat(
    providerId: ProviderId,
    requiredUsd: bigint,
  ): Promise<TreasuryOperation | null> {
    const provider = rampRegistry.get(providerId);
    if (provider.settlementModel !== "partner_float") return null;
    const available = await capacityService.floatAvailable(providerId);
    const shortfall = requiredUsd - available + policy.treasury.float.topUpMarginMicroUsd;
    if (shortfall <= 0n) return null;
    const chain = policy.defaultChain as Chain;
    const treasuryAvailable = await capacityService.treasuryAvailable(chain);
    const amount = shortfall < treasuryAvailable ? shortfall : treasuryAvailable;
    if (amount <= 0n) return null;
    return this.insertOp({
      key: `ensure-float:${providerId}:${requiredUsd.toString()}`,
      kind: "float_topup",
      provider: providerId,
      chain,
      amountUsd: amount,
      amountUsdc: amount,
    });
  }

  async progressOperation(opId: string): Promise<void> {
    await withTx(async (tx) => {
      const op = await tx.treasuryOperation.findUniqueOrThrow({ where: { id: opId } });
      if (op.status === "complete" || op.status === "failed") return;
      const chain = op.chain as Chain;
      const settlement = this.provider();

      if (op.status === "planned") {
        if (op.kind === "float_topup") {
          const amount = op.amountUsdc ?? op.amountUsd;
          const topUp = await settlement.topUpAddress(op.provider, chain);
          await walletService.createTransfer(tx, {
            key: `topup:${op.id}`,
            purpose: "float_topup",
            chain,
            amount,
            from: { kind: "treasury" },
            to: { kind: "external", address: topUp },
            treasuryOperationId: op.id,
          });
          await tx.treasuryOperation.update({
            where: { id: op.id },
            data: { status: "transferring" },
          });
          return;
        }
        const treasury = await walletService.treasuryAddress(chain);
        const { ref } = await settlement.requestWithdrawal({
          key: `wdr:${op.id}`,
          provider: op.provider,
          chain,
          usd: op.amountUsd,
          address: treasury,
        });
        await ledgerService.post(
          tx,
          floatWithdrawalRequested({ id: op.id, provider: op.provider, usd: op.amountUsd }),
        );
        await tx.treasuryOperation.update({
          where: { id: op.id },
          data: { status: "awaiting_provider", externalRef: ref },
        });
        return;
      }

      if (op.status === "transferring") {
        const transfer = await tx.chainTransfer.findUnique({ where: { key: `topup:${op.id}` } });
        if (!transfer) return;
        if (transfer.status === "pending" || transfer.status === "submitted" || transfer.status === "awaiting_approval") {
          return;
        }
        if (transfer.status === "confirmed") {
          await tx.treasuryOperation.update({
            where: { id: op.id },
            data: { status: "awaiting_provider" },
          });
          await jobService.enqueue(tx, { kind: "treasury.progress", subjectId: op.id });
          return;
        }
        await ledgerService.post(
          tx,
          transferReleased({ id: transfer.id, chain, amount: fromDbRaw(transfer.amount) }),
        );
        await tx.treasuryOperation.update({
          where: { id: op.id },
          data: { status: "failed", failureReason: transfer.failureReason ?? "TRANSFER_FAILED" },
        });
        return;
      }

      if (op.status === "awaiting_provider") {
        if (op.kind === "float_topup") {
          const transfer = await tx.chainTransfer.findUnique({ where: { key: `topup:${op.id}` } });
          if (!transfer?.txHash) return;
          const result = await settlement.confirmTopUp({
            key: transfer.key,
            provider: op.provider,
            chain,
            usdc: fromDbRaw(transfer.amount),
            txHash: transfer.txHash,
          });
          if (result.state === "pending") {
            await jobService.enqueue(tx, {
              kind: "treasury.progress",
              subjectId: op.id,
              runAt: new Date(now().getTime() + 5_000),
            });
            return;
          }
          if (result.state === "failed") {
            await tx.treasuryOperation.update({
              where: { id: op.id },
              data: { status: "failed", failureReason: "TOPUP_MISMATCH" },
            });
            return;
          }
          await ledgerService.post(
            tx,
            floatToppedUp({
              id: op.id,
              provider: op.provider,
              chain,
              amountUsdc: fromDbRaw(transfer.amount),
              usd: op.amountUsd,
            }),
          );
          await tx.treasuryOperation.update({
            where: { id: op.id },
            data: { status: "complete", externalRef: transfer.txHash },
          });
          return;
        }
        const withdrawal = await settlement.getWithdrawal(`wdr:${op.id}`);
        if (withdrawal.state === "pending") {
          await jobService.enqueue(tx, {
            kind: "treasury.progress",
            subjectId: op.id,
            runAt: new Date(now().getTime() + 5_000),
          });
          return;
        }
        if (withdrawal.state === "failed") {
          await tx.treasuryOperation.update({
            where: { id: op.id },
            data: { status: "failed", failureReason: "WITHDRAWAL_FAILED" },
          });
          return;
        }
        await ledgerService.post(
          tx,
          floatWithdrawalReceived({
            id: op.id,
            provider: op.provider,
            chain,
            amount: withdrawal.usdcSent ?? op.amountUsd,
          }),
        );
        await tx.treasuryOperation.update({
          where: { id: op.id },
          data: { status: "complete", externalRef: withdrawal.txHash },
        });
      }
    });
  }

  async seedOpeningBalances(i: {
    treasuryMicroUsdc: Record<Chain, bigint>;
    floatMicroUsd: bigint;
  }): Promise<void> {
    const mode = integrationModes().wallets;
    for (const [chain, amount] of Object.entries(i.treasuryMicroUsdc) as [Chain, bigint][]) {
      if (amount <= 0n) continue;
      await withTx((tx) =>
        ledgerService.post(tx, openingBalance({ account: acct.treasury(chain), amount })),
      );
      if (mode === "simulated") {
        const address = await walletService.treasuryAddress(chain);
        await simChain.mint(chain, address, amount, `opening:treasury:${chain}`);
      }
    }
    if (mode === "simulated") {
      await simRamp.seedFloat("yellowcard", i.floatMicroUsd);
      await withTx((tx) =>
        ledgerService.post(
          tx,
          openingBalance({ account: acct.float("yellowcard"), amount: i.floatMicroUsd }),
        ),
      );
    } else {
      const balance = await rampRegistry.get("yellowcard").floatBalance();
      if (balance !== null && balance > 0n) {
        await withTx((tx) =>
          ledgerService.post(
            tx,
            openingBalance({ account: acct.float("yellowcard"), amount: balance }),
          ),
        );
      }
    }
  }
}

export const treasuryService = new TreasuryService();
