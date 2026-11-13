import {
  authMiddleware,
  bodyValidatorMiddleware,
  idempotencyKeyMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { withdrawalService } from "@/backend/services/withdrawals";
import {
  withdrawalBodySchema,
  type WithdrawalBodySchema,
} from "@/backend/validators/withdrawal.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<WithdrawalBodySchema>(
  async (request) => {
    const { quote_id } = request.validatedData as WithdrawalBodySchema;
    const { withdrawal, created } = await withdrawalService.confirm(
      request.user!.id,
      quote_id,
      request.idempotencyKey!,
    );
    return ok(withdrawal, "Withdrawal", created ? 201 : 200);
  },
  [
    authMiddleware,
    originMiddleware,
    idempotencyKeyMiddleware,
    bodyValidatorMiddleware(withdrawalBodySchema),
  ],
);
