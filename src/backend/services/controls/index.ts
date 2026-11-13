import { Prisma, type OperationalControl } from "@/server/prisma";
import { type DbClient, db } from "@/server/db";
import type { ErrorCode } from "@/types";
import { ServiceUnavailableException } from "@/utils/exceptions";

export type ControlScope =
  | "deposits"
  | "payouts"
  | "trading"
  | "provider:yellowcard"
  | "provider:paycrest";

export type SetControlInput = {
  scope: ControlScope;
  paused: boolean;
  reason: string;
  actorId: string | null;
};

class ControlsService {
  async isPaused(scope: ControlScope, client: DbClient = db): Promise<boolean> {
    const row = await client.operationalControl.findUnique({ where: { scope } });
    return row?.paused ?? false;
  }

  async assertOpen(scope: ControlScope, code: ErrorCode): Promise<void> {
    if (await this.isPaused(scope)) {
      throw new ServiceUnavailableException(`Paused: ${scope}`, code);
    }
  }

  async set(client: DbClient, input: SetControlInput): Promise<OperationalControl> {
    const existing = await client.operationalControl.findUnique({
      where: { scope: input.scope },
    });
    if (existing) {
      const data: Prisma.OperationalControlUpdateInput = {
        paused: input.paused,
        reason: input.reason,
        updatedById: input.actorId,
      };
      return client.operationalControl.update({
        where: { scope: input.scope },
        data,
      });
    }
    const data: Prisma.OperationalControlCreateInput = {
      scope: input.scope,
      paused: input.paused,
      reason: input.reason,
      updatedById: input.actorId,
    };
    return client.operationalControl.create({ data });
  }
}

export const controlsService = new ControlsService();
