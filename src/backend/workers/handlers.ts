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
import { executionService } from "@/backend/services/execution";
import { investmentService } from "@/backend/services/investments";
import { PermanentJobError, type JobKind } from "@/backend/services/jobs/types";
import { notificationProjector } from "@/backend/services/notifications";
import { pollOpenWork } from "@/backend/services/orders/poller";
import { reconciliationService } from "@/backend/services/reconciliation";
import { stockService } from "@/backend/services/stocks";
import { testPoolAligner } from "@/backend/services/stocks/test-pools";
import { strategyService } from "@/backend/services/strategies";
import { tradeService } from "@/backend/services/trades";
import { walletService } from "@/backend/services/wallets";
import { executionAccounts } from "@/backend/services/wallets/execution-accounts";
import { customerChainId } from "@/backend/services/app/network";
import { customerOrderExecutor } from "@/backend/services/customer-orders/executor";
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
  "wallets.prepare_execution": async (job) => {
    await executionAccounts.ensure(job.subjectId, customerChainId());
  },
  "orders.progress": async (job) => {
    await customerOrderExecutor.progress(job.subjectId);
  },
  "orders.sweep": async () => {
    await customerOrderExecutor.sweep();
  },
  "trade.progress": async (job) => {
    await tradeService.progress(job.subjectId);
  },
  "operation.progress": async (job) => {
    await executionService.progress(job.subjectId);
  },
  "investment.progress": async (job) => {
    await investmentService.progress(job.subjectId);
  },
  "strategy.progress": async (job) => {
    await strategyService.progress(job.subjectId);
  },
  "notifications.project": async () => {
    await notificationProjector.run();
  },
  "deposit.progress": async (job) => {
    await depositService.progress(job.subjectId);
  },
  "poll.open_work": async () => {
    await pollOpenWork(now());
  },
  "stocks.reference_sync": async () => {
    // Live reference sync runs only when Base Sepolia is configured; CI and the
    // local replica path keep the seeded reference data.
    if (!process.env.BASE_SEPOLIA_RPC_URL) return;
    await stockService.syncReference();
  },
  "stocks.align_test_pools": async () => {
    await testPoolAligner.run();
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
  "earnings.recognize": async (job) => {
    await earningsService.recognize(job.subjectId);
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
