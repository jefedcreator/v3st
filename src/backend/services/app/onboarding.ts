import { db } from "@/server/db";
import { INVEST_DOCUMENTS } from "@/backend/content/documents";
import { agreementService } from "@/backend/services/agreements";
import { bankAccountService } from "@/backend/services/bank-accounts";
import { ConflictException } from "@/utils/exceptions";
import type { AppOnboardingStepKey, AppOnboardingStepDto, AppOnboardingDto } from "@/types/app";

export type { AppOnboardingStepKey, AppOnboardingStepDto, AppOnboardingDto } from "@/types/app";

export type AppReadiness = "add_money" | "invest" | "withdraw" | "earn";

const STEP_TITLES: Record<AppOnboardingStepKey, string> = {
  identity: "Verify your identity",
  pin: "Create your PIN",
  agreements: "Review and accept",
  bank_account: "Add your bank account",
};

class AppOnboardingService {
  async status(userId: string): Promise<AppOnboardingDto> {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const accepted = await agreementService.acceptedCurrent(userId);
    const bankAccount = await bankAccountService.getActiveRow(userId);
    const done: Record<AppOnboardingStepKey, boolean> = {
      identity: user.kycStatus === "verified",
      pin: user.pinHash !== null,
      agreements: INVEST_DOCUMENTS.every((slug) => accepted.has(slug)),
      bank_account: bankAccount !== null,
    };
    const steps: AppOnboardingStepDto[] = (
      ["identity", "pin", "agreements", "bank_account"] as AppOnboardingStepKey[]
    ).map((key) => ({
      key,
      title: STEP_TITLES[key],
      done: done[key],
      required: key !== "bank_account",
    }));
    const nextStep = steps.find((step) => step.required && !step.done)?.key ?? null;
    return {
      complete: nextStep === null,
      next_step: nextStep,
      steps,
    };
  }

  // Server-side readiness for each money action; every customer route that moves
  // money checks this before doing anything else.
  async assertReady(userId: string, need: AppReadiness): Promise<void> {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const accepted = await agreementService.acceptedCurrent(userId);
    const identityOk = user.kycStatus === "verified";
    const documentsOk = INVEST_DOCUMENTS.every((slug) => accepted.has(slug));
    if (!identityOk || !documentsOk) {
      throw new ConflictException("Finish setting up your account first", "ONBOARDING_INCOMPLETE");
    }
    // invest, withdraw and earn each build on add_money and need the PIN.
    if (need !== "add_money") {
      if (user.pinHash === null) {
        throw new ConflictException("Create your PIN first", "ONBOARDING_INCOMPLETE");
      }
    }
    if (need === "withdraw") {
      const bankAccount = await bankAccountService.getActiveRow(userId);
      if (!bankAccount) {
        throw new ConflictException("Add your bank account first", "ONBOARDING_INCOMPLETE");
      }
    }
    if (need === "earn" && !accepted.has("earn-risks")) {
      throw new ConflictException("Accept the Earn risks first", "ONBOARDING_INCOMPLETE");
    }
  }
}

export const appOnboardingService = new AppOnboardingService();
