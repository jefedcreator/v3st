import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appEarnService } from "@/backend/services/app/earn";
import {
  earnPreviewBodySchema,
  type EarnPreviewBodySchema,
} from "@/backend/validators/app/earn.validator";
import { idParamSchema, type IdParamSchema } from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<EarnPreviewBodySchema, IdParamSchema, null>(
  async (request) => {
    return ok(
      await appEarnService.preview(
        request.user!.id,
        request.params!.id,
        request.validatedData!.amount_kobo,
      ),
      "Earn preview",
    );
  },
  [
    authMiddleware,
    originMiddleware,
    pathParamValidatorMiddleware(idParamSchema),
    bodyValidatorMiddleware(earnPreviewBodySchema),
  ],
  { audience: "customer" },
);
