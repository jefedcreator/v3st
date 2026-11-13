import type {
  ChainTransfer,
  Job,
  TradeOrder,
  TradePurpose,
  TransferPurpose,
} from "@/server/prisma";

import { PermanentJobError, type JobKind } from "@/backend/services/jobs/types";
import { walletService } from "@/backend/services/wallets";
import { webhookService } from "@/backend/services/webhooks";

export const handlers: Partial<Record<JobKind, (job: Job) => Promise<void>>> = {
  "webhook.process": async (job) => {
    await webhookService.process(job.subjectId);
  },
  "wallets.provision": async (job) => {
    await walletService.ensureUserWallets(job.subjectId);
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
> = {};

export const tradeSettledHandlers: Partial<
  Record<TradePurpose, (t: TradeOrder) => Promise<void>>
> = {};

export async function runJob(job: Job): Promise<void> {
  const handler = handlers[job.kind as JobKind];
  if (!handler) {
    throw new PermanentJobError("NO_HANDLER");
  }
  await handler(job);
}
