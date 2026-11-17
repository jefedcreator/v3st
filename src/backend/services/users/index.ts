import { db } from "@/server/db";
import { bankAccountService } from "@/backend/services/bank-accounts";
import type { MeDto } from "@/types/dto";

class UserService {
  async me(userId: string): Promise<MeDto> {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      role: user.role,
      kyc: {
        status: user.kycStatus,
        tier: user.kycTier,
        verified_name: user.verifiedName,
        simulated: user.kycMode === "simulated",
      },
      wallets: (
        await db.wallet.findMany({ where: { userId } })
      ).map((w) => ({ family: w.family, address: w.address })),
      bank_account: await bankAccountService.getActive(userId),
      earnings_preference: {
        mode: user.earningsMode,
        stock_id: user.reinvestStockId,
        consent_version: user.earningsConsentVersion,
        allow_background_conversion: user.allowBackgroundConversion,
        max_conversion_fee_bps: user.maxConversionFeeBps,
        max_fx_bps: user.maxFxBps,
      },
      beta: { stage: "beta", test_funds_only: true },
    };
  }
}

export const userService = new UserService();
