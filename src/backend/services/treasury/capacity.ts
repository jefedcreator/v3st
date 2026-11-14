import { db } from "@/server/db";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import type { ProviderId } from "@/backend/services/ramp/types";

class CapacityService {
  async floatAvailable(provider: ProviderId): Promise<bigint> {
    const float = await ledgerService.balance(acct.float(provider));
    const reserved = await db.rampOrder.aggregate({
      _sum: { usdAmount: true },
      where: {
        provider,
        kind: { in: ["withdrawal", "earnings_payout"] },
        status: { in: ["created", "funds_collected"] },
      },
    });
    return float - (reserved._sum.usdAmount ?? 0n);
  }

  async treasuryAvailable(chain: string): Promise<bigint> {
    return ledgerService.balance(acct.treasury(chain));
  }
}

export const capacityService = new CapacityService();
