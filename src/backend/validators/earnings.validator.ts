import { z } from "zod";

import { cuidSchema } from "./index.validator";

export const earningsPreferenceSchema = z
  .object({
    mode: z.enum(["payout", "reinvest"]),
    stock_id: cuidSchema.optional(),
  })
  .strict();

export type EarningsPreferenceSchema = z.infer<typeof earningsPreferenceSchema>;
