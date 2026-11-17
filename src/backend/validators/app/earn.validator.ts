import { z } from "zod";

import { EARN_MINIMUM_KOBO } from "@/backend/content/earn-products";
import { cuidSchema, minorAmountSchema } from "../index.validator";

const pinField = z.string().regex(/^\d{4}$/);

const earnAmountKoboField = minorAmountSchema.refine(
  (value) => value >= EARN_MINIMUM_KOBO,
  "Below the minimum for Earn",
);

export const earnPreviewBodySchema = z
  .object({
    amount_kobo: earnAmountKoboField,
  })
  .strict();
export type EarnPreviewBodySchema = z.infer<typeof earnPreviewBodySchema>;

export const earnJoinBodySchema = z
  .object({
    preview_id: cuidSchema,
    pin: pinField,
    accepted_risk_version: z.string().min(1).max(64),
  })
  .strict();
export type EarnJoinBodySchema = z.infer<typeof earnJoinBodySchema>;

export const earnWithdrawBodySchema = z
  .object({
    preview_id: cuidSchema,
    pin: pinField,
  })
  .strict();
export type EarnWithdrawBodySchema = z.infer<typeof earnWithdrawBodySchema>;

export const earningsPreferenceBodySchema = z
  .object({
    choice: z.enum(["payout", "reinvest"]),
    stock_id: cuidSchema.optional(),
    pin: pinField,
  })
  .strict();
export type EarningsPreferenceBodySchema = z.infer<typeof earningsPreferenceBodySchema>;
