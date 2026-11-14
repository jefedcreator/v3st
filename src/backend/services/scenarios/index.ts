import { type Hex } from "viem";

import { type OnchainOperation } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { accountAddressFor, unpack } from "@/backend/services/execution";
import { jobService } from "@/backend/services/jobs";
import { o1RouterAbi, stockDistributionAbi } from "@/backend/services/onchain/abis";
import { publicClientFor, readManifest, relayerAccount, walletClientFor } from "@/backend/services/onchain/testnet";
import type { StrategyQuote } from "@/backend/services/onchain/types";
import { simRamp } from "@/backend/services/simulator/ramp";
import { simVenue } from "@/backend/services/simulator/venue";
import type { OnchainScenarioInput, OnchainScenarioResult } from "@/types/onchain";
import { toDbRaw } from "@/utils/asset-units";
import { ConflictException, NotFoundException, UnprocessableEntityException } from "@/utils/exceptions";

import type { ScenarioBodySchema } from "@/backend/validators/scenario.validator";

const DEPOSIT_PAYABLE_STATES = ["created", "awaiting_transfer", "expired"] as const;
const PAYOUT_OPEN_STATES = ["created", "funds_collected", "submitted"] as const;

class ScenarioService {
  async run(
    userId: string,
    input: ScenarioBodySchema,
  ): Promise<{ order_id: string; scenario: string }> {
    const order = await db.rampOrder.findUnique({ where: { id: input.order_id } });
    if (order?.userId !== userId) {
      throw new NotFoundException("Order not found");
    }
    if (order.providerMode !== "simulated") {
      throw new ConflictException(
        "Scenarios are only available for simulated orders",
        "SCENARIO_UNAVAILABLE",
      );
    }
    const invalidState = (): never => {
      throw new ConflictException(
        `Scenario ${input.scenario} does not fit order state ${order.status}`,
        "INVALID_SCENARIO_STATE",
      );
    };

    switch (input.scenario) {
      case "deposit_paid":
      case "deposit_paid_third_party":
      case "deposit_paid_amount": {
        if (order.kind !== "deposit") invalidState();
        if (!DEPOSIT_PAYABLE_STATES.includes(order.status as (typeof DEPOSIT_PAYABLE_STATES)[number])) {
          invalidState();
        }
        const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
        const senderName =
          input.scenario === "deposit_paid_third_party"
            ? "CHINEDU EZE"
            : (user.verifiedName ?? "");
        await simRamp.markCollectionPaid(order.provider, order.id, {
          ngnAmount: input.ngn_amount ?? order.ngnAmount,
          senderName,
        });
        break;
      }
      case "deposit_failed": {
        if (order.kind !== "deposit") invalidState();
        if (!DEPOSIT_PAYABLE_STATES.includes(order.status as (typeof DEPOSIT_PAYABLE_STATES)[number])) {
          invalidState();
        }
        await simRamp.markCollectionFailed(order.provider, order.id);
        break;
      }
      case "payout_rejected": {
        if (order.kind !== "withdrawal" && order.kind !== "earnings_payout") invalidState();
        if (!PAYOUT_OPEN_STATES.includes(order.status as (typeof PAYOUT_OPEN_STATES)[number])) {
          invalidState();
        }
        await simRamp.addFault("payout", order.id);
        break;
      }
      case "buy_reverts": {
        if (order.kind !== "deposit" || !order.stockId) invalidState();
        if (order.status !== "received" && order.status !== "funded") invalidState();
        await simVenue.addFault("swap", `deposit-buy:${order.id}`);
        break;
      }
    }

    await jobService.enqueue(db, {
      kind: order.kind === "deposit" ? "deposit.progress" : "payout.progress",
      subjectId: order.id,
    });
    return { order_id: order.id, scenario: input.scenario };
  }
}

class OnchainScenarioService {
  // A fixed local fixture call (signed by the relayer against the loopback testnet):
  // never client-supplied calldata, recipients or RPC endpoints.
  private async fixtureCall(to: string, abi: unknown, functionName: string, args: unknown[]): Promise<void> {
    const account = relayerAccount();
    const client = walletClientFor(account);
    const hash = await client.writeContract({
      address: to as Hex,
      abi: abi as never,
      functionName,
      args,
    });
    await publicClientFor().waitForTransactionReceipt({ hash });
  }

  private async distributionProvenanceOf(op: OnchainOperation): Promise<{ distribution: string; launchId: string } | null> {
    const expected = (op.expected ?? {}) as { quote?: unknown };
    if (!expected.quote) return null;
    const quote = unpack(expected.quote) as StrategyQuote;
    const strategy = await db.strategy.findUnique({ where: { id: quote.request.strategyId } });
    const prov = strategy?.provenance as { distribution?: string; launchId?: string } | null;
    if (typeof prov?.distribution === "string" && typeof prov?.launchId === "string") {
      return { distribution: prov.distribution, launchId: prov.launchId };
    }
    return null;
  }

  // User-owned local-testnet operation plus a named scenario. Scenarios alter only
  // local fixture state through signed testnet contract calls and the normal worker;
  // they never post ledger earnings directly or operate actual provider resources.
  async runOnchain(
    userId: string,
    input: OnchainScenarioInput,
    key: string,
  ): Promise<OnchainScenarioResult> {
    const op = await db.onchainOperation.findUnique({ where: { id: input.operation_id } });
    if (op?.userId !== userId) {
      throw new NotFoundException("Operation not found", "NOT_FOUND");
    }
    if (op.status === "finalized" || op.status === "reverted") {
      throw new ConflictException(
        `Scenario ${input.scenario} does not fit operation state ${op.status}`,
        "INVALID_SCENARIO_STATE",
      );
    }
    const faultKey = `onchain:${userId}:${key}`;
    const existing = await db.simFault.findUnique({
      where: { scope_key: { scope: "onchain.scenario", key: faultKey } },
    });
    if (existing) {
      return { operation_id: op.id, scenario: input.scenario };
    }
    await db.simFault.create({ data: { scope: "onchain.scenario", key: faultKey } });
    const progressKind = op.kind === "strategy" ? "strategy.progress" : "operation.progress";

    switch (input.scenario) {
      case "delayed_confirmation": {
        await jobService.enqueue(db, {
          kind: progressKind,
          subjectId: op.id,
          runAt: new Date(now().getTime() + 30_000),
        });
        break;
      }
      case "sponsor_shortage": {
        const scope = `operation:${op.id}`;
        await db.sponsorBudget.upsert({
          where: { scope },
          create: {
            scope,
            windowStart: now(),
            spentWei: toDbRaw(policy.onchain.sponsor.perOperationCapWei),
            capWei: toDbRaw(policy.onchain.sponsor.perOperationCapWei),
          },
          update: { spentWei: toDbRaw(policy.onchain.sponsor.perOperationCapWei) },
        });
        await jobService.enqueue(db, { kind: progressKind, subjectId: op.id });
        break;
      }
      case "partial_fill": {
        if (op.kind !== "spot" || op.providerId !== "o1") {
          throw new ConflictException(
            "partial_fill fits o1 spot operations only",
            "INVALID_SCENARIO_STATE",
          );
        }
        const manifest = readManifest();
        await this.fixtureCall(
          manifest.contracts.O1RouterReplica!.address,
          o1RouterAbi,
          "setPartialFillBps",
          [5_000n],
        );
        await jobService.enqueue(db, { kind: progressKind, subjectId: op.id });
        break;
      }
      case "revert": {
        const prov = await this.distributionProvenanceOf(op);
        if (!prov) {
          throw new ConflictException(
            "revert fits distribution-claim operations only",
            "INVALID_SCENARIO_STATE",
          );
        }
        const account = await accountAddressFor(db, op);
        // Zero the entitlement via a signed local fixture call so the claim reverts
        // onchain when the normal worker executes it.
        await this.fixtureCall(prov.distribution, stockDistributionAbi, "setEntitlement", [
          prov.launchId,
          account,
          0n,
        ]);
        await jobService.enqueue(db, { kind: progressKind, subjectId: op.id });
        break;
      }
      case "zero_rewards": {
        const prov = await this.distributionProvenanceOf(op);
        if (prov) {
          const account = await accountAddressFor(db, op);
          await this.fixtureCall(prov.distribution, stockDistributionAbi, "setEntitlement", [
            prov.launchId,
            account,
            0n,
          ]);
        }
        // Otherwise the claim simply finds nothing accrued and finalizes with no
        // reward logs; the worker records no receipt either way.
        await jobService.enqueue(db, { kind: progressKind, subjectId: op.id });
        break;
      }
      default: {
        throw new UnprocessableEntityException("Unknown scenario", "SCENARIO_UNAVAILABLE");
      }
    }
    return { operation_id: op.id, scenario: input.scenario };
  }
}

export const onchainScenarioService = new OnchainScenarioService();

export const scenarioService = new ScenarioService();
