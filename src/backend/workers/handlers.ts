import type {
  ChainTransfer,
  Job,
  TradeOrder,
  TradePurpose,
  TransferPurpose,
} from "@/server/prisma";

import { now } from "@/backend/clock";
import { depositService } from "@/backend/services/deposits";
import { PermanentJobError, type JobKind } from "@/backend/services/jobs/types";
import { pollOpenWork } from "@/backend/services/orders/poller";
import { tradeService } from "@/backend/services/trades";
import { walletService } from "@/backend/services/wallets";
import { webhookService } from "@/backend/services/webhooks";

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
};

export const tradeSettledHandlers: Partial<
  Record<TradePurpose, (t: TradeOrder) => Promise<void>>
> = {
  deposit_buy: async (t) => {
    await depositService.onBuySettled(t);
  },
};

export async function runJob(job: Job): Promise<void> {
  const handler = handlers[job.kind as JobKind];
  if (!handler) {
    throw new PermanentJobError("NO_HANDLER");
  }
  await handler(job);
}
