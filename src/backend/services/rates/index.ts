import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { rampRegistry } from "@/backend/services/ramp";
import type { ProviderId } from "@/backend/services/ramp/types";
import type { Rate } from "@/utils/money";

export type DisplayRates = {
  provider: ProviderId;
  depositRate: Rate;
  payoutRate: Rate;
  asOf: Date;
  expiresAt: Date;
};

class RatesService {
  private cache = new Map<ProviderId, { value: DisplayRates; expiresAtMs: number }>();

  async display(): Promise<DisplayRates> {
    const provider = await rampRegistry.selectForNewOrder("in");
    const at = now();
    const cached = this.cache.get(provider.id);
    if (cached && at.getTime() < cached.expiresAtMs) {
      return cached.value;
    }
    const r = await provider.rates();
    const value: DisplayRates = {
      provider: provider.id,
      depositRate: r.buy,
      payoutRate: r.sell,
      asOf: r.asOf,
      expiresAt: new Date(at.getTime() + policy.rates.displayCacheSeconds * 1_000),
    };
    this.cache.set(provider.id, {
      value,
      expiresAtMs: value.expiresAt.getTime(),
    });
    return value;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const ratesService = new RatesService();
