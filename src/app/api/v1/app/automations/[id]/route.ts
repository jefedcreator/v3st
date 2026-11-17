import {
  authMiddleware,
  originMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appAutomationsService } from "@/backend/services/app/automations";
import { idParamSchema, type IdParamSchema } from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const DELETE = withMiddleware<null, IdParamSchema, null>(
  async (request) => {
    return ok(
      await appAutomationsService.revoke(request.user!.id, request.params!.id),
      "Automation turned off",
    );
  },
  [authMiddleware, originMiddleware, pathParamValidatorMiddleware(idParamSchema)],
  { audience: "customer" },
);
