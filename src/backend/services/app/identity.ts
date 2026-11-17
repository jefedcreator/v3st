import { withTx } from "@/server/db";
import { kycService, type PersonaId } from "@/backend/services/kyc";
import { jobService } from "@/backend/services/jobs";
import { appOnboardingService, type AppOnboardingDto } from "./onboarding";
import type { AppTestIdentityDto } from "@/types/app";

export type { AppTestIdentityDto } from "@/types/app";

// The customer-facing menu (names in display case; the verified names the
// personas resolve to stay upper-case, as a bank would return them).
const TEST_IDENTITIES: readonly AppTestIdentityDto[] = [
  { id: "ada_tier2", name: "Adaeze Obi", description: "Verified, higher limits" },
  { id: "tunde_tier1", name: "Babatunde Adeyemi", description: "Verified, standard limits" },
  { id: "rejected", name: "Not verified", description: "Try a failed check" },
];

class AppIdentityService {
  // The beta's stand-in for BVN verification: a fixed menu of test identities.
  testIdentities(): AppTestIdentityDto[] {
    return TEST_IDENTITIES.map((identity) => ({ ...identity }));
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
