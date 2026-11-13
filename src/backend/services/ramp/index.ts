import type { RampOrder } from "@/server/prisma";
import { env } from "@/env";
import { now } from "@/backend/clock";
import { BetaPolicyError, integrationModes } from "@/backend/integrations/beta-policy";
import { controlsService } from "@/backend/services/controls";
import { PermanentJobError } from "@/backend/services/jobs/types";
import { ServiceUnavailableException } from "@/utils/exceptions";

import { providerHealth } from "./health";
import { YellowCardProvider } from "./yellowcard";
import { createPaycrestProvider } from "./paycrest";
import { createSimulatedRampProvider } from "./simulated";
import type { Direction, ProviderId, RampProvider } from "./types";

const rawProviders = new Map<ProviderId, RampProvider>();
const wrappedProviders = new Map<ProviderId, RampProvider>();

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
  if (id === "paycrest") {
    return createPaycrestProvider();
  }
  return createSimulatedRampProvider(id);
}

function getRaw(id: ProviderId): RampProvider {
  let p = rawProviders.get(id);
  if (!p) {
    p = build(id);
    rawProviders.set(id, p);
  }
  return p;
}

function wrapWithHealth(p: RampProvider): RampProvider {
  const record = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      const result = await fn();
      await providerHealth.record(p.id, true, now());
      return result;
    } catch (error) {
      await providerHealth.record(p.id, false, now());
      throw error;
    }
  };
  return {
    ...p,
    quote: (direction, ngnAmount) => record(() => p.quote(direction, ngnAmount)),
    createCollection: (input) => record(() => p.createCollection(input)),
    createPayout: (input) => record(() => p.createPayout(input)),
  };
}

export function register(p: RampProvider): void {
  rawProviders.set(p.id, p);
  wrappedProviders.delete(p.id);
}

export function reset(): void {
  rawProviders.clear();
  wrappedProviders.clear();
}

export const rampRegistry = {
  get(id: ProviderId): RampProvider {
    let w = wrappedProviders.get(id);
    if (!w) {
      w = wrapWithHealth(getRaw(id));
      wrappedProviders.set(id, w);
    }
    return w;
  },

  forOrder(order: Pick<RampOrder, "provider" | "providerMode">): RampProvider {
    const p = getRaw(order.provider);
    if (p.mode !== order.providerMode) {
      throw new PermanentJobError("MODE_MISMATCH");
    }
    return p;
  },

  async selectForNewOrder(direction: Direction): Promise<RampProvider> {
    void direction;
    for (const id of ["yellowcard", "paycrest"] as const) {
      if (await controlsService.isPaused(`provider:${id}`)) continue;
      if (await providerHealth.isOpen(id, now())) continue;
      return this.get(id);
    }
    throw new ServiceUnavailableException(
      "No ramp provider is currently available",
      "RAIL_UNAVAILABLE",
    );
  },
};
