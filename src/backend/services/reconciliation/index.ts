import type { ReconciliationRun } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { alertService } from "@/backend/services/alerts";
import { controlsService } from "@/backend/services/controls";
import { depositService } from "@/backend/services/deposits";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { pollOpenWork } from "@/backend/services/orders/poller";
import { rampRegistry } from "@/backend/services/ramp";
import { withdrawalService } from "@/backend/services/withdrawals";
import { CHAINS, type Chain } from "@/backend/services/wallets/chains";
import { simulatedWalletProvider } from "@/backend/services/wallets/simulated";
import { walletService } from "@/backend/services/wallets";

type CheckResult = {
  check: string;
  expected: string;
  observed: string | null;
  delta: string | null;
  threshold: string;
  status: "ok" | "breach" | "unavailable";
};

class ReconciliationService {
  private async checks(): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const threshold = policy.recon.thresholdMicro;

    const provider = rampRegistry.get("yellowcard");
    if (provider.settlementModel === "partner_float") {
      const expected = await ledgerService.balance(acct.float(provider.id));
      let observed: bigint | null;
      try {
        observed = await provider.floatBalance();
      } catch {
        observed = null;
      }
      results.push(this.makeCheck(`float:${provider.id}`, expected, observed, threshold));
    }

    for (const chain of Object.keys(CHAINS) as Chain[]) {
      const expected =
        (await ledgerService.balance(acct.treasury(chain))) +
        (await ledgerService.balance(acct.treasuryOutbound(chain)));
      const treasuryWallet = await db.treasuryWallet.findUnique({ where: { chain } });
      let observed: bigint | null = null;
      if (treasuryWallet) {
        try {
          observed = await simulatedWalletProvider.balance(
            chain,
            treasuryWallet.address,
            CHAINS[chain].usdc,
          );
        } catch {
          observed = null;
        }
      }
      results.push(this.makeCheck(`treasury:${chain}`, expected, observed, threshold));
    }
    return results;
  }

  private makeCheck(
    check: string,
    expected: bigint,
    observed: bigint | null,
    threshold: bigint,
  ): CheckResult {
    if (observed === null) {
      return {
        check,
        expected: expected.toString(),
        observed: null,
        delta: null,
        threshold: threshold.toString(),
        status: "unavailable",
      };
    }
    const delta = observed - expected;
    const abs = delta < 0n ? -delta : delta;
    return {
      check,
      expected: expected.toString(),
      observed: observed.toString(),
      delta: delta.toString(),
      threshold: threshold.toString(),
      status: abs > threshold ? "breach" : "ok",
    };
  }

  private async refreshInFlight(): Promise<void> {
    await pollOpenWork(now());
    const orders = await db.rampOrder.findMany({
      where: {
        status: { in: ["created", "awaiting_transfer", "received", "funds_collected", "submitted", "reversed"] },
      },
    });
    for (const order of orders) {
      try {
        if (order.kind === "deposit") await depositService.progress(order.id);
        else await withdrawalService.progress(order.id);
      } catch {
        // inline refresh is best-effort; the breach recompute decides
      }
    }
    const transfers = await db.chainTransfer.findMany({
      where: { status: { in: ["pending", "submitted"] } },
    });
    for (const transfer of transfers) {
      try {
        await walletService.progressTransfer(transfer.id);
      } catch {
        // best-effort
      }
    }
  }

  async run(asOf: Date): Promise<ReconciliationRun> {
    let results = await this.checks();
    const breached = results.filter((r) => r.status === "breach");
    if (breached.length > 0) {
      await this.refreshInFlight();
      results = await this.checks();
    }
    let status: "balanced" | "breached" | "incomplete" = "balanced";
    for (const r of results) {
      if (r.status === "breach") status = "breached";
      else if (r.status === "unavailable" && status !== "breached") status = "incomplete";
    }
    const run = await db.reconciliationRun.create({
      data: { asOf, status, results: results as unknown as never[] },
    });
    if (status !== "balanced") {
      await controlsService.set(db, {
        scope: "payouts",
        paused: true,
        reason: `reconciliation:${run.id}`,
        actorId: null,
      });
      for (const r of results) {
        if (r.status === "breach") {
          await alertService.raise(db, {
            kind: "recon.breach",
            severity: "critical",
            dedupeKey: `recon.breach:${r.check}`,
            message: `Reconciliation breach on ${r.check}: expected ${r.expected}, observed ${r.observed}, delta ${r.delta}`,
            context: { check: r.check, runId: run.id },
          });
        }
      }
    }
    return run;
  }
}

export const reconciliationService = new ReconciliationService();
