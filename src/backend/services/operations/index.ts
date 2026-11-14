import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { alertService } from "@/backend/services/alerts";
import { controlsService, type ControlScope } from "@/backend/services/controls";
import { depositService } from "@/backend/services/deposits";
import { jobService } from "@/backend/services/jobs";
import { walletService } from "@/backend/services/wallets";
import type { ControlDto, OpsStatusDto, TransferDto } from "@/types/dto";
import { ConflictException, NotFoundException, UnprocessableEntityException } from "@/utils/exceptions";

class OperationsService {
  async status(): Promise<OpsStatusDto> {
    const controls = await db.operationalControl.findMany({ orderBy: { scope: "asc" } });
    const alerts = await db.operationalAlert.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: "asc" },
    });
    const deadJobs = await db.job.count({ where: { status: "dead" } });
    const oldest = await db.job.findFirst({
      where: { status: "pending" },
      orderBy: { runAt: "asc" },
    });
    const awaitingApproval = await db.chainTransfer.count({
      where: { status: "awaiting_approval" },
    });
    const lastRecon = await db.reconciliationRun.findFirst({
      orderBy: { createdAt: "desc" },
    });
    return {
      controls: controls.map((c) => ({
        scope: c.scope,
        paused: c.paused,
        reason: c.reason,
        updated_by: c.updatedById,
      })),
      open_alerts: alerts.map((a) => ({
        id: a.id,
        kind: a.kind,
        severity: a.severity,
        message: a.message,
        created_at: a.createdAt.toISOString(),
      })),
      dead_jobs: deadJobs,
      oldest_pending_job_age_seconds: oldest
        ? Math.max(0, Math.floor((now().getTime() - oldest.runAt.getTime()) / 1_000))
        : null,
      awaiting_approval_transfers: awaitingApproval,
      last_reconciliation: lastRecon
        ? { id: lastRecon.id, as_of: lastRecon.asOf.toISOString(), status: lastRecon.status }
        : null,
    };
  }

  async setControl(
    actorId: string,
    input: { scope: ControlScope; paused: boolean; reason: string },
  ): Promise<ControlDto> {
    if (!input.paused && input.reason.trim().length < 10) {
      throw new UnprocessableEntityException(
        "Resuming a control requires a reason of at least 10 characters",
        "VALIDATION_FAILED",
      );
    }
    const control = await controlsService.set(db, { ...input, actorId });
    return {
      scope: control.scope,
      paused: control.paused,
      reason: control.reason,
      updated_by: control.updatedById,
    };
  }

  async retryJob(actorId: string, jobId: string): Promise<void> {
    const job = await db.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException("Job not found");
    if (job.status !== "dead") {
      throw new ConflictException("Only dead jobs can be retried", "NOT_DEAD");
    }
    await jobService.retryDead(jobId);
    await alertService.raise(db, {
      kind: "ops.job_retried",
      severity: "info",
      dedupeKey: `ops.job_retried:${jobId}:${now().toISOString()}`,
      message: `Operator ${actorId} retried job ${job.key}`,
      context: { jobId, actorId },
    });
  }

  async refundHeldDeposit(actorId: string, orderId: string): Promise<void> {
    const order = await db.rampOrder.findUnique({ where: { id: orderId } });
    if (order?.kind !== "deposit") {
      throw new NotFoundException("Deposit order not found");
    }
    if (order.holdReason !== "missing_sender" && order.holdReason !== "needs_review") {
      throw new ConflictException(
        "Only missing_sender or needs_review holds can be refunded",
        "STALE_STATE",
      );
    }
    await depositService.requestRefund(orderId, actorId);
  }

  async approveTransfer(actorId: string, transferId: string): Promise<TransferDto> {
    const transfer = await walletService.approveTransfer(transferId, actorId);
    return {
      id: transfer.id,
      key: transfer.key,
      purpose: transfer.purpose,
      status: transfer.status,
      chain: transfer.chain,
      from_address: transfer.fromAddress,
      to_address: transfer.toAddress,
      amount: transfer.amount.toString(),
      approvals: transfer.approvals,
      failure_reason: transfer.failureReason,
    };
  }
}

export const operationsService = new OperationsService();
