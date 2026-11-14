import { db } from "@/server/db";
import { jobService } from "@/backend/services/jobs";
import { simRamp } from "@/backend/services/simulator/ramp";
import { simVenue } from "@/backend/services/simulator/venue";
import { ConflictException, NotFoundException } from "@/utils/exceptions";

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

export const scenarioService = new ScenarioService();
