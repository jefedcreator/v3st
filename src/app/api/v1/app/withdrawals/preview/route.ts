import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appCashService } from "@/backend/services/app/cash";
import {
  withdrawalPreviewBodySchema,
  type WithdrawalPreviewBodySchema,
} from "@/backend/validators/app/cash.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<WithdrawalPreviewBodySchema, null, null>(
  async (request) => {
    const { amount_kobo } = request.validatedData!;
    return ok(
      await appCashService.previewWithdrawal(request.user!.id, amount_kobo),
      "Withdrawal preview",
    );
  },
  [authMiddleware, originMiddleware, bodyValidatorMiddleware(withdrawalPreviewBodySchema)],
  { audience: "customer" },
);
