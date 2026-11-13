import {
  authMiddleware,
  bodyValidatorMiddleware,
  idempotencyKeyMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { depositService } from "@/backend/services/deposits";
import {
  depositBodySchema,
  type DepositBodySchema,
} from "@/backend/validators/deposit.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<DepositBodySchema>(
  async (request) => {
    const body = request.validatedData as DepositBodySchema;
    const { deposit, created } = await depositService.create(
      request.user!.id,
      { ngn_amount: body.ngn_amount, stock_id: body.stock_id },
      request.idempotencyKey!,
    );
    const status = !created ? 200 : deposit.status === "awaiting_transfer" ? 201 : 202;
    return ok(deposit, "Deposit", status);
  },
  [
    authMiddleware,
    originMiddleware,
    idempotencyKeyMiddleware,
    bodyValidatorMiddleware(depositBodySchema),
  ],
);
