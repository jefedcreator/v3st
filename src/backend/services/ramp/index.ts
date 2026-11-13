import type { RampOrder } from "@/server/prisma";
import { env } from "@/env";
import { BetaPolicyError, integrationModes } from "@/backend/integrations/beta-policy";
import { PermanentJobError } from "@/backend/services/jobs/types";

import { YellowCardProvider } from "./yellowcard";
import { createSimulatedRampProvider } from "./simulated";
import type { Direction, ProviderId, RampProvider } from "./types";

const providers = new Map<ProviderId, RampProvider>();

function build(id: ProviderId): RampProvider {
  const modes = integrationModes();
  if (id === "yellowcard" && modes.yellowcard === "sandbox") {
    if (!env.YELLOWCARD_API_KEY || !env.YELLOWCARD_API_SECRET) {
      throw new BetaPolicyError(
        "YELLOWCARD_MODE=sandbox requires YELLOWCARD_API_KEY and YELLOWCARD_API_SECRET",
      );
    }
    return new YellowCardProvider({
      apiKey: env.YELLOWCARD_API_KEY,
      secret: env.YELLOWCARD_API_SECRET,
    });
  }
  return createSimulatedRampProvider(id);
}

export function register(p: RampProvider): void {
  providers.set(p.id, p);
}

export function reset(): void {
  providers.clear();
}

export const rampRegistry = {
  get(id: ProviderId): RampProvider {
    let p = providers.get(id);
    if (!p) {
      p = build(id);
      providers.set(id, p);
    }
    return p;
  },

  forOrder(order: Pick<RampOrder, "provider" | "providerMode">): RampProvider {
    const p = this.get(order.provider);
    if (p.mode !== order.providerMode) {
      throw new PermanentJobError("MODE_MISMATCH");
    }
    return p;
  },

  async selectForNewOrder(direction: Direction): Promise<RampProvider> {
    void direction;
    return this.get("yellowcard");
  },
};
