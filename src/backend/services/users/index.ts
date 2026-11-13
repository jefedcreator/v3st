import { db } from "@/server/db";
import type { MeDto } from "@/types/dto";

class UserService {
  async me(userId: string): Promise<MeDto> {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      id: user.id,
      phone: user.phone,
      role: user.role,
      kyc: {
        status: user.kycStatus,
        tier: user.kycTier,
        verified_name: user.verifiedName,
        simulated: user.kycMode === "simulated",
      },
      wallets: [],
      bank_account: null,
      earnings_preference: {
        mode: user.earningsMode,
        stock_id: user.reinvestStockId,
      },
      beta: { stage: "beta", test_funds_only: true },
    };
  }
}

export const userService = new UserService();
