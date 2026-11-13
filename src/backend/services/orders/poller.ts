import { db } from "@/server/db";
import { policy } from "@/backend/config/policy";
import { jobService } from "@/backend/services/jobs";
import type { JobKind } from "@/backend/services/jobs/types";

export async function pollOpenWork(at: Date): Promise<number> {
  let count = 0;
  const rearm = async (kind: JobKind, subjectId: string): Promise<void> => {
    const job = await db.job.findUnique({ where: { key: `${kind}:${subjectId}` } });
    if (job?.status === "dead") return;
    await jobService.enqueue(db, { kind, subjectId, runAt: at });
    count += 1;
  };

  const watchFrom = new Date(at.getTime() - policy.deposits.latePaymentWatchHours * 3_600_000);
  const deposits = await db.rampOrder.findMany({
    where: {
      kind: "deposit",
      OR: [
        { status: { in: ["created", "awaiting_transfer", "received"] } },
        { status: "expired", updatedAt: { gte: watchFrom } },
      ],
    },
  });
  for (const order of deposits) {
    await rearm("deposit.progress", order.id);
  }

  const transfers = await db.chainTransfer.findMany({
    where: { status: { in: ["pending", "submitted"] } },
  });
  for (const transfer of transfers) {
    await rearm("chain.progress", transfer.id);
  }

  const trades = await db.tradeOrder.findMany({
    where: { status: { in: ["pending", "submitted"] } },
  });
  for (const trade of trades) {
    await rearm("trade.progress", trade.id);
  }

  return count;
}
