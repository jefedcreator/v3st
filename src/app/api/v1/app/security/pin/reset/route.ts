import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { securityService } from "@/backend/services/security";
import { resetPinSchema, type ResetPinSchema } from "@/backend/validators/app/security.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<ResetPinSchema, null, null>(
  async (request) => {
    const { access_token, identity_token, pin } = request.validatedData!;
    const { revoked } = await securityService.resetPin(
      request.user!.id,
      { accessToken: access_token, identityToken: identity_token },
      pin,
      request.user!.session.id,
    );
    return ok({ pin_set: true, other_sessions_signed_out: revoked }, "PIN reset");
  },
  [authMiddleware, originMiddleware, bodyValidatorMiddleware(resetPinSchema)],
  { audience: "customer" },
);
