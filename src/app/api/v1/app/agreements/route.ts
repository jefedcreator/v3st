import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { agreementService } from "@/backend/services/agreements";
import { appOnboardingService } from "@/backend/services/app/onboarding";
import {
  agreementsSchema,
  type AgreementsSchema,
} from "@/backend/validators/app/onboarding.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<AgreementsSchema, null, null>(
  async (request) => {
    await agreementService.accept(request.user!.id, request.validatedData!.documents);
    return ok(await appOnboardingService.status(request.user!.id), "Documents accepted");
  },
  [authMiddleware, originMiddleware, bodyValidatorMiddleware(agreementsSchema)],
  { audience: "customer" },
);
