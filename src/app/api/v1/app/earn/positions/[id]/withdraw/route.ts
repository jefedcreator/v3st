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
  earnWithdrawBodySchema,
  type EarnWithdrawBodySchema,
} from "@/backend/validators/app/earn.validator";
import { idParamSchema, type IdParamSchema } from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<EarnWithdrawBodySchema, IdParamSchema, null>(
  async (request) => {
    const { preview_id, pin } = request.validatedData!;
    const { dto, created } = await appEarnService.withdraw(
      request.user!.id,
      request.params!.id,
      { previewId: preview_id, pin },
      request.idempotencyKey!,
    );
    return ok(dto, "Withdrawal started", created ? 201 : 200);
  },
  [
    authMiddleware,
    originMiddleware,
    pathParamValidatorMiddleware(idParamSchema),
    bodyValidatorMiddleware(earnWithdrawBodySchema),
    idempotencyKeyMiddleware,
  ],
  { audience: "customer" },
);
