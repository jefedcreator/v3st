import { z } from "zod";

import { cuidSchema } from "./index.validator";

export const earningsPreferenceSchema = z
  .object({
    mode: z.enum(["payout", "reinvest"]),
    stock_id: cuidSchema.optional(),
    // Versioned consent limits for fee/FX and background conversion of reward
    // assets; consent_version is required whenever any limit is supplied.
    consent_version: z.string().min(1).max(64).optional(),
    allow_background_conversion: z.boolean().optional(),
    max_conversion_fee_bps: z.number().int().min(0).max(10_000).optional(),
    max_fx_bps: z.number().int().min(0).max(10_000).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const hasLimit =
      val.allow_background_conversion !== undefined ||
      val.max_conversion_fee_bps !== undefined ||
      val.max_fx_bps !== undefined;
    if (hasLimit && !val.consent_version) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "consent_version is required when conversion consent limits are supplied",
      });
    }
  });

export type EarningsPreferenceSchema = z.infer<typeof earningsPreferenceSchema>;
