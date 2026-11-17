import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { securityService } from "@/backend/services/security";
import { setPinSchema, type SetPinSchema } from "@/backend/validators/app/security.validator";
import { ok } from "@/utils/response";

export const PUT = withMiddleware<SetPinSchema, null, null>(
  async (request) => {
    const { pin, current_pin } = request.validatedData!;
    await securityService.setPin(request.user!.id, pin, current_pin ?? null);
    return ok({ pin_set: true }, "PIN set");
  },
  [authMiddleware, originMiddleware, bodyValidatorMiddleware(setPinSchema)],
  { audience: "customer" },
);
