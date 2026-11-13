import { Prisma, type AlertSeverity } from "@/server/prisma";
import { type DbClient, db } from "@/server/db";
import { now } from "@/backend/clock";

export type RaiseAlertInput = {
  kind: string;
  severity: AlertSeverity;
  dedupeKey: string;
  message: string;
  context?: Record<string, string>;
};

class AlertService {
  async raise(client: DbClient, input: RaiseAlertInput): Promise<void> {
    const data: Prisma.OperationalAlertCreateInput = {
      kind: input.kind,
      severity: input.severity,
      dedupeKey: input.dedupeKey,
      message: input.message,
      context: input.context ?? {},
    };
    try {
      await client.operationalAlert.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return;
      }
      throw error;
    }
  }

  async resolve(id: string, actorId: string): Promise<void> {
    const data: Prisma.OperationalAlertUpdateInput = {
      resolvedAt: now(),
      resolvedById: actorId,
    };
    await db.operationalAlert.update({ where: { id }, data });
  }
}

export const alertService = new AlertService();
