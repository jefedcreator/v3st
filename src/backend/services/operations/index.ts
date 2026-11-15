import { type OperationStatus } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { listProviderEvidence } from "@/backend/integrations/provider-evidence";
import { alertService } from "@/backend/services/alerts";
import { controlsService, type ControlScope } from "@/backend/services/controls";
import { depositService } from "@/backend/services/deposits";
import { jobService } from "@/backend/services/jobs";
import { onchainRegistry } from "@/backend/services/onchain/registry";
import "@/backend/services/onchain/providers";
import { readManifest, testnetService } from "@/backend/services/onchain/testnet";
import type { ProviderCapabilities } from "@/backend/services/onchain/types";
import { walletService } from "@/backend/services/wallets";
import type { IntegrationEvidenceDto, OnchainOpsDto } from "@/types/contract";
import type { ControlDto, OpsStatusDto, TransferDto } from "@/types/dto";
import { fromDbRaw } from "@/utils/asset-units";
import { ConflictException, NotFoundException, UnprocessableEntityException } from "@/utils/exceptions";

// Operations that have not reached a final proved state keep operator attention.
const UNRESOLVED: OperationStatus[] = [
  "pending",
  "prepared",
  "signed",
  "broadcast",
  "confirmed",
  "unknown",
  "needs_review",
];

class OperationsService {
  // Audited provider evidence: every enabled beta adapter is a local testnet
  // replica; actual provider factories stay disabled and are counted.
  async integrations(): Promise<IntegrationEvidenceDto[]> {
    const out: IntegrationEvidenceDto[] = [];
    for (const evidence of listProviderEvidence()) {
      const spot = onchainRegistry.describe(evidence.id, "spot");
      const strategy = onchainRegistry.describe(evidence.id, "strategy");
      let capabilities: ProviderCapabilities | null = spot ?? strategy;
      if (spot && strategy) {
        capabilities = {
          ...spot,
          liquidity: spot.liquidity || strategy.liquidity,
          distributions: spot.distributions || strategy.distributions,
          separateClaim: strategy.separateClaim,
          exactOutput: spot.exactOutput || strategy.exactOutput,
        };
      }
      if (!capabilities) continue;
      out.push({
        provider_id: evidence.id,
        integration_kind: capabilities.kind,
        beta_adapter: "local_testnet_replica",
        actual_integration: "disabled_unverified",
        capabilities,
        evidence_id: capabilities.evidenceId,
        testnet_evidence: evidence.testnetEvidence.status,
        real_provider_calls: onchainRegistry.actualFactoryCalls,
        limitation: evidence.note,
      });
    }
    return out;
  }

  async onchainStatus(): Promise<OnchainOpsDto> {
    let network = await db.onchainNetwork.findFirst({ orderBy: { createdAt: "desc" } });
    let verified = false;
    let verificationReason: string | null = null;
    try {
      const manifest = readManifest();
      network = await db.onchainNetwork.findUnique({ where: { deploymentId: manifest.deploymentId } });
      const result = await testnetService.verify(manifest);
      verified = result.ok && network?.networkId === manifest.networkId;
      verificationReason = verified ? null : result.reason ?? "Active deployment is not registered in this database";
    } catch (error) {
      verificationReason = error instanceof Error ? error.message : "testnet manifest unavailable";
    }
    const unresolvedOperations = await db.onchainOperation.count({
      where: { status: { in: UNRESOLVED } },
    });
    const holds = await db.onchainOperation.findMany({
      where: { errorReason: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { key: true, status: true, errorReason: true },
    });
    const today = now().toISOString().slice(0, 10);
    const sponsor = await db.sponsorBudget.findUnique({ where: { scope: `daily:${today}` } });
    const staleCutoff = new Date(now().getTime() - 10 * 60_000);
    const staleObservations = await db.chainObservation.count({
      where: { observedAt: { lt: staleCutoff }, operation: { status: { in: UNRESOLVED } } },
    });
    return {
      network: {
        network_id: network?.networkId ?? "unregistered",
        chain_id: network?.chainId ?? policy.onchain.chainId,
        deployment_id: network?.deploymentId ?? "unregistered",
        verified,
        verification_reason: verificationReason,
      },
      unresolved_operations: unresolvedOperations,
      operation_holds: holds.map((h) => ({
        key: h.key,
        status: h.status,
        error_reason: h.errorReason,
      })),
      sponsor_spend_today_wei: sponsor ? fromDbRaw(sponsor.spentWei).toString() : "0",
      sponsor_daily_cap_wei: sponsor
        ? fromDbRaw(sponsor.capWei).toString()
        : policy.onchain.sponsor.dailyCapWei.toString(),
      stale_observations: staleObservations,
    };
  }

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
