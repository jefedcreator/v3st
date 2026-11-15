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

// Retired: the fixed weekly yield (quantity x simWeeklyEarningMicroPerShare) is
// gone. Static stock holding and idle cash yield zero cash; income exists only as
// finalized source proceeds (reward receipts). Historical fixture rows keep their
// explicit "legacy_fixture" provenance and are never reinterpreted.
export const simulatedEarningsSource: EarningsSource = {
  mode: "simulated",

  async harvest() {
    return 0n;
  },
};
