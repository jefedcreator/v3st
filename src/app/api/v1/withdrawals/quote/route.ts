import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { withdrawalService } from "@/backend/services/withdrawals";
import {
  withdrawalQuoteBodySchema,
  type WithdrawalQuoteBodySchema,
} from "@/backend/validators/withdrawal.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<WithdrawalQuoteBodySchema>(
  async (request) => {
    const body = request.validatedData as WithdrawalQuoteBodySchema;
    const quote = await withdrawalService.quote(request.user!.id, {
      ngn_amount: body.ngn_amount,
      stock_id: body.stock_id,
    });
    return ok(quote, "Withdrawal quote");
  },
  [authMiddleware, originMiddleware, bodyValidatorMiddleware(withdrawalQuoteBodySchema)],
);
