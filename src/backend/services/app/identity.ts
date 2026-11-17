import { db, withTx } from "@/server/db";
import { BETA_PERSONAS } from "@/backend/services/kyc/personas";
import { kycService, type PersonaId } from "@/backend/services/kyc";
import { jobService } from "@/backend/services/jobs";
import { appOnboardingService, type AppOnboardingDto } from "./onboarding";

export type AppTestIdentityDto = {
  id: PersonaId;
  name: string;
  description: string;
};

const TEST_IDENTITY_DESCRIPTIONS: Record<PersonaId, string> = {
  ada_tier2: "Verified, higher limits",
  tunde_tier1: "Verified, standard limits",
  rejected: "Try a failed check",
};

class AppIdentityService {
  // The beta's stand-in for BVN verification: a fixed menu of test identities.
  testIdentities(): AppTestIdentityDto[] {
    return BETA_PERSONAS.map((persona) => ({
      id: persona.id,
      name: persona.name ?? "Not verified",
      description: TEST_IDENTITY_DESCRIPTIONS[persona.id],
    }));
  }

  async verify(
    userId: string,
    id: PersonaId,
  ): Promise<{ verified: boolean; onboarding: AppOnboardingDto }> {
    const kyc = await kycService.verify(userId, { persona: id });
    const verified = kyc.status === "verified";
    if (verified) {
      // Prepare the customer's execution account on the customer network in the
      // background so their first add-money is not delayed by a deployment.
      await withTx(async (tx) => {
        await jobService.enqueue(tx, {
          kind: "wallets.prepare_execution",
          subjectId: userId,
        });
      });
    }
    return { verified, onboarding: await appOnboardingService.status(userId) };
  }
}

export const appIdentityService = new AppIdentityService();
