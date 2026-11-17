import {
  authMiddleware,
  bodyValidatorMiddleware,
  idempotencyKeyMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appCashService } from "@/backend/services/app/cash";
import {
  cashDepositBodySchema,
  type CashDepositBodySchema,
} from "@/backend/validators/app/cash.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<CashDepositBodySchema, null, null>(
  async (request) => {
    const { amount_kobo } = request.validatedData!;
    const { dto, created } = await appCashService.addMoney(
      request.user!.id,
      amount_kobo,
      request.idempotencyKey!,
    );
    return ok(dto, "Add money", created ? 201 : 200);
  },
  [
    authMiddleware,
    originMiddleware,
    idempotencyKeyMiddleware,
    bodyValidatorMiddleware(cashDepositBodySchema),
  ],
  { audience: "customer" },
);
