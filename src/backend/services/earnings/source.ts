import type { Stock } from "@/server/prisma";
import type { ProviderMode } from "@/backend/integrations/beta-policy";

export interface EarningsSource {
  readonly mode: ProviderMode;
  harvest(i: {
    userId: string;
    stock: Stock;
    quantity: bigint;
    week: string;
  }): Promise<bigint>;
}

export const simulatedEarningsSource: EarningsSource = {
  mode: "simulated",

  async harvest(i) {
    const scale = 10n ** BigInt(i.stock.decimals);
    return (i.quantity * i.stock.simWeeklyEarningMicroPerShare) / scale;
  },
};
