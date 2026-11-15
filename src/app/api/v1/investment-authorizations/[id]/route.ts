import {
  authMiddleware,
  originMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
  type PathParameters,
} from "@/backend/middleware";
import { authorizationService } from "@/backend/services/authorizations";
import { idParamSchema } from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const DELETE = withMiddleware<null, PathParameters, null>(
  async (request) => {
    // Revoking blocks new activity only; accepted/broadcast work is preserved for
    // reconciliation. Replaying a revoke returns the same authorization.
    const authorization = await authorizationService.revoke(request.user!.id, request.params!.id);
    return ok(authorization, "Authorization revoked");
  },
  [authMiddleware, originMiddleware, pathParamValidatorMiddleware(idParamSchema)],
);
