import {
  authMiddleware,
  bodyValidatorMiddleware,
  idempotencyKeyMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appCashService } from "@/backend/services/app/cash";
import {
  withdrawalBodySchema,
  type WithdrawalBodySchema,
} from "@/backend/validators/app/cash.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<WithdrawalBodySchema, null, null>(
  async (request) => {
    const { preview_id, pin } = request.validatedData!;
    const { dto, created } = await appCashService.withdraw(
      request.user!.id,
      { previewId: preview_id, pin },
      request.idempotencyKey!,
    );
    return ok(dto, "Withdrawal started", created ? 201 : 200);
  },
  [
    authMiddleware,
    originMiddleware,
    idempotencyKeyMiddleware,
    bodyValidatorMiddleware(withdrawalBodySchema),
  ],
  { audience: "customer" },
);
