import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { kycService } from "@/backend/services/kyc";
import {
  personaValidatorSchema,
  type PersonaValidatorSchema,
} from "@/backend/validators/identity.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<PersonaValidatorSchema, null, null>(
  async (request) => {
    const { persona } = request.validatedData!;
    const kyc = await kycService.verify(request.user!.id, { persona });
    return ok(kyc, "Identity verification recorded (simulated)");
  },
  [authMiddleware, originMiddleware, bodyValidatorMiddleware(personaValidatorSchema)],
);
