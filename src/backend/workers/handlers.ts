import type {
  ChainTransfer,
  Job,
  TradeOrder,
  TradePurpose,
  TransferPurpose,
} from "@/server/prisma";

import { now } from "@/backend/clock";
import { depositService } from "@/backend/services/deposits";
import { earningsBatchService } from "@/backend/services/earnings/batch";
import { earningsService } from "@/backend/services/earnings";
import { PermanentJobError, type JobKind } from "@/backend/services/jobs/types";
import { pollOpenWork } from "@/backend/services/orders/poller";
import { reconciliationService } from "@/backend/services/reconciliation";
import { tradeService } from "@/backend/services/trades";
import { walletService } from "@/backend/services/wallets";
import { treasuryService } from "@/backend/services/treasury";
import { webhookService } from "@/backend/services/webhooks";
import { withdrawalService } from "@/backend/services/withdrawals";

export const handlers: Partial<Record<JobKind, (job: Job) => Promise<void>>> = {
  "webhook.process": async (job) => {
    await webhookService.process(job.subjectId);
  },
  "wallets.provision": async (job) => {
    await walletService.ensureUserWallets(job.subjectId);
  },
  "trade.progress": async (job) => {
    await tradeService.progress(job.subjectId);
  },
  "deposit.progress": async (job) => {
    await depositService.progress(job.subjectId);
  },
  "poll.open_work": async () => {
    await pollOpenWork(now());
  },
  "payout.progress": async (job) => {
    await withdrawalService.progress(job.subjectId);
  },
  "treasury.rebalance": async () => {
    await treasuryService.rebalance(now());
  },
  "treasury.progress": async (job) => {
    await treasuryService.progressOperation(job.subjectId);
  },
  "earnings.harvest": async (job) => {
    await earningsService.harvest(job.subjectId);
  },
  "earnings.float_precheck": async (job) => {
    await earningsBatchService.precheck(job.subjectId);
  },
  "earnings.payout_batch": async (job) => {
    await earningsBatchService.runBatch(job.subjectId, now());
  },
  "reconcile.run": async (job) => {
    await reconciliationService.run(new Date(job.subjectId));
  },
  "chain.progress": async (job) => {
    const transfer = await walletService.progressTransfer(job.subjectId);
    if (transfer.status === "confirmed" || transfer.status === "failed") {
      const settled = transferSettledHandlers[transfer.purpose];
      if (settled) await settled(transfer);
    }
  },
};

export const transferSettledHandlers: Partial<
  Record<TransferPurpose, (t: ChainTransfer) => Promise<void>>
> = {
  deposit_funding: async (t) => {
    await depositService.onFundingSettled(t);
  },
  payout_collection: async (t) => {
    await withdrawalService.onCollectionSettled(t);
  },
  direct_payout_funding: async (t) => {
    await withdrawalService.onDirectFundingSettled(t);
  },
  payout_return: async (t) => {
    await withdrawalService.onReturnSettled(t);
  },
  float_topup: async (t) => {
    if (t.treasuryOperationId) {
      await treasuryService.progressOperation(t.treasuryOperationId);
    }
  },
};

export const tradeSettledHandlers: Partial<
  Record<TradePurpose, (t: TradeOrder) => Promise<void>>
> = {
  deposit_buy: async (t) => {
    await depositService.onBuySettled(t);
  },
  withdrawal_sell: async (t) => {
    await withdrawalService.onSellSettled(t);
  },
  reinvest: async (t) => {
    await earningsService.onReinvestSettled(
      t.id,
      t.status === "failed",
      t.key,
      t.userId,
      t.chain,
    );
  },
};

export async function runJob(job: Job): Promise<void> {
  const handler = handlers[job.kind as JobKind];
  if (!handler) {
    throw new PermanentJobError("NO_HANDLER");
  }
  await handler(job);
}
