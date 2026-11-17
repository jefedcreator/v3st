import {
  authMiddleware,
  originMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { securityService } from "@/backend/services/security";
import {
  idParamSchema,
  type IdParamSchema,
} from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const DELETE = withMiddleware<null, IdParamSchema, null>(
  async (request) => {
    await securityService.revokeSession(request.user!.id, request.params!.id);
    return ok({ signed_out: true }, "Session signed out");
  },
  [authMiddleware, originMiddleware, pathParamValidatorMiddleware(idParamSchema)],
  { audience: "customer" },
);
