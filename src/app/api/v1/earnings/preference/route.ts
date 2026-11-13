import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { earningsService } from "@/backend/services/earnings";
import {
  earningsPreferenceSchema,
  type EarningsPreferenceSchema,
} from "@/backend/validators/earnings.validator";
import { ok } from "@/utils/response";

export const PUT = withMiddleware<EarningsPreferenceSchema>(
  async (request) => {
    const body = request.validatedData as EarningsPreferenceSchema;
    const preference = await earningsService.setPreference(request.user!.id, {
      mode: body.mode,
      stock_id: body.stock_id,
    });
    return ok(preference, "Earnings preference updated");
  },
  [authMiddleware, originMiddleware, bodyValidatorMiddleware(earningsPreferenceSchema)],
);
