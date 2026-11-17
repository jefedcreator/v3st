import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appAutomationsService } from "@/backend/services/app/automations";
import {
  automationRenewBodySchema,
  type AutomationRenewBodySchema,
} from "@/backend/validators/app/settings.validator";
import { idParamSchema, type IdParamSchema } from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<AutomationRenewBodySchema, IdParamSchema, null>(
  async (request) => {
    return ok(
      await appAutomationsService.renew(
        request.user!.id,
        request.params!.id,
        request.validatedData!.pin,
      ),
      "Automation renewed",
    );
  },
  [
    authMiddleware,
    originMiddleware,
    pathParamValidatorMiddleware(idParamSchema),
    bodyValidatorMiddleware(automationRenewBodySchema),
  ],
  { audience: "customer" },
);
