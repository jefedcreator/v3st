import {
  authMiddleware,
  bodyValidatorMiddleware,
  idempotencyKeyMiddleware,
  originMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appEarnService } from "@/backend/services/app/earn";
import {
  earnJoinBodySchema,
  type EarnJoinBodySchema,
} from "@/backend/validators/app/earn.validator";
import { idParamSchema, type IdParamSchema } from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<EarnJoinBodySchema, IdParamSchema, null>(
  async (request) => {
    const { preview_id, pin, accepted_risk_version } = request.validatedData!;
    const { dto, created } = await appEarnService.join(
      request.user!.id,
      request.params!.id,
      { previewId: preview_id, pin, acceptedRiskVersion: accepted_risk_version },
      request.idempotencyKey!,
    );
    return ok(dto, "Joined Earn", created ? 201 : 200);
  },
  [
    authMiddleware,
    originMiddleware,
    pathParamValidatorMiddleware(idParamSchema),
    bodyValidatorMiddleware(earnJoinBodySchema),
    idempotencyKeyMiddleware,
  ],
  { audience: "customer" },
);
