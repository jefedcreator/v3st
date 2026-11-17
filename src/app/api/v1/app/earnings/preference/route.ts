import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appEarningsService } from "@/backend/services/app/earnings";
import {
  earningsPreferenceBodySchema,
  type EarningsPreferenceBodySchema,
} from "@/backend/validators/app/earn.validator";
import { ok } from "@/utils/response";

export const PUT = withMiddleware<EarningsPreferenceBodySchema, null, null>(
  async (request) => {
    const { choice, stock_id, pin } = request.validatedData!;
    return ok(
      await appEarningsService.setPreference(request.user!.id, {
        choice,
        stockId: stock_id ?? null,
        pin,
      }),
      "Earnings preference saved",
    );
  },
  [authMiddleware, originMiddleware, bodyValidatorMiddleware(earningsPreferenceBodySchema)],
  { audience: "customer" },
);
