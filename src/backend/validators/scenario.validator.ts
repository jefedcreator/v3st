import { z } from "zod";

import { cuidSchema, minorAmountSchema } from "./index.validator";

export const scenarioBodySchema = z
  .object({
    order_id: cuidSchema,
    scenario: z.enum([
      "deposit_paid",
      "deposit_paid_third_party",
      "deposit_paid_amount",
      "deposit_failed",
      "payout_rejected",
      "buy_reverts",
    ]),
    ngn_amount: minorAmountSchema.optional(),
  })
  .strict()
  .refine((value) => value.scenario !== "deposit_paid_amount" || value.ngn_amount !== undefined, {
    message: "ngn_amount is required for deposit_paid_amount",
    path: ["ngn_amount"],
  });

export type ScenarioBodySchema = z.infer<typeof scenarioBodySchema>;
