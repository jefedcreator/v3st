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

export const PUT = withMiddleware<EarningsPreferenceSchema, null, null>(
  async (request) => {
    const body = request.validatedData!;
    const preference = await earningsService.setPreference(request.user!.id, {
      mode: body.mode,
      stock_id: body.stock_id,
      consent_version: body.consent_version,
      allow_background_conversion: body.allow_background_conversion,
      max_conversion_fee_bps: body.max_conversion_fee_bps,
      max_fx_bps: body.max_fx_bps,
    });
    return ok(preference, "Earnings preference updated");
  },
  [authMiddleware, originMiddleware, bodyValidatorMiddleware(earningsPreferenceSchema)],
);
