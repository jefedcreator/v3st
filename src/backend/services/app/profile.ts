import { db } from "@/server/db";
import { appCashService } from "@/backend/services/app/cash";
import { firstNameOf } from "@/backend/services/app/format";
import { UnprocessableEntityException } from "@/utils/exceptions";
import type { AppProfileDto } from "@/types/app";

export type { AppProfileDto } from "@/types/app";

export const PREFERRED_NAME_PATTERN = /^[A-Za-z][A-Za-z' -]{0,39}$/;

class AppProfileService {
  async get(userId: string): Promise<AppProfileDto> {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const verified = user.kycStatus === "verified";
    let level: AppProfileDto["identity"]["level"] = null;
    if (verified) {
      if (user.kycTier >= 2) level = "higher";
      else if (user.kycTier === 1) level = "standard";
    }
    return {
      first_name: firstNameOf(user.verifiedName),
      preferred_name: user.preferredName,
      email: user.email,
      identity: { verified, level },
      bank_account: await appCashService.bankAccount(userId),
    };
  }

  async update(userId: string, input: { preferredName: string | null }): Promise<AppProfileDto> {
    if (input.preferredName !== null && !PREFERRED_NAME_PATTERN.test(input.preferredName)) {
      throw new UnprocessableEntityException("That name isn't allowed");
    }
    await db.user.update({
      where: { id: userId },
      data: { preferredName: input.preferredName },
    });
    return this.get(userId);
  }
}

export const appProfileService = new AppProfileService();
