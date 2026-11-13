import { type Prisma, type HoldReason, type OrderKind, type OrderStatus, type RampOrder } from "@/server/prisma";
import { db, type Tx, lockRows } from "@/server/db";
import { now } from "@/backend/clock";
import { ConflictException, NotFoundException } from "@/utils/exceptions";
import type { JournalInput } from "@/backend/services/ledger/postings";
import { ledgerService } from "@/backend/services/ledger";
import { jobService } from "@/backend/services/jobs";
import type { JobInput } from "@/backend/services/jobs/types";

import { DEPOSIT_TRANSITIONS, PAYOUT_TRANSITIONS } from "./transitions";

export type TransitionInput = {
  order: Pick<RampOrder, "id" | "userId" | "kind" | "status" | "version">;
  to: OrderStatus;
  patch?: Prisma.RampOrderUpdateInput;
  journals?: JournalInput[];
  jobs?: JobInput[];
  actor: string;
  reason?: string;
};

function matrixFor(kind: OrderKind): Readonly<Record<OrderStatus, readonly OrderStatus[]>> {
  return kind === "deposit" ? DEPOSIT_TRANSITIONS : PAYOUT_TRANSITIONS;
}

class OrderService {
  async transition(tx: Tx, input: TransitionInput): Promise<RampOrder> {
    const matrix = matrixFor(input.order.kind);
    if (input.to !== input.order.status) {
      const allowed = matrix[input.order.status];
      if (!allowed.includes(input.to)) {
        throw new ConflictException(
          `Invalid transition ${input.order.status} -> ${input.to}`,
          "INVALID_TRANSITION",
        );
      }
    }

    const data: Prisma.RampOrderUpdateInput = {
      status: input.to,
      version: { increment: 1 },
    };
    if (input.patch) {
      Object.assign(data, input.patch);
    }
    const result = await tx.rampOrder.updateMany({
      where: { id: input.order.id, version: input.order.version },
      data,
    });
    if (result.count === 0) {
      throw new ConflictException("Stale order state", "STALE_STATE");
    }

    let holdReason: HoldReason | null = null;
    if (input.patch && "holdReason" in input.patch) {
      holdReason = input.patch.holdReason as HoldReason | null;
    }
    const transitionData: Prisma.OrderTransitionCreateInput = {
      orderId: input.order.id,
      fromStatus: input.order.status,
      toStatus: input.to,
      holdReason,
      actor: input.actor,
      reason: input.reason ?? null,
      createdAt: now(),
    };
    await tx.orderTransition.create({ data: transitionData });

    for (const journal of input.journals ?? []) {
      await ledgerService.post(tx, journal);
    }
    for (const job of input.jobs ?? []) {
      await jobService.enqueue(tx, job);
    }

    const eventData: Prisma.UserEventCreateInput = {
      userId: input.order.userId,
      type: "order.updated",
      subjectId: input.order.id,
      status: input.to,
      createdAt: now(),
    };
    await tx.userEvent.create({ data: eventData });

    return tx.rampOrder.findUniqueOrThrow({ where: { id: input.order.id } });
  }

  async loadForUpdate(tx: Tx, orderId: string): Promise<RampOrder> {
    await lockRows(tx, "ramp_orders", [orderId]);
    return tx.rampOrder.findUniqueOrThrow({ where: { id: orderId } });
  }

  async getOwned(
    userId: string,
    orderId: string,
    kind: OrderKind[],
  ): Promise<RampOrder> {
    const where: Prisma.RampOrderWhereInput = {
      id: orderId,
      userId,
      kind: { in: kind },
    };
    const order = await db.rampOrder.findFirst({ where });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    return order;
  }
}

export const orderService = new OrderService();
