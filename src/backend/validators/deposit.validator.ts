import { z } from "zod";

import { cuidSchema, minorAmountSchema } from "./index.validator";

export const depositBodySchema = z
  .object({
    ngn_amount: minorAmountSchema,
    stock_id: cuidSchema.optional(),
  })
  .strict();

export type DepositBodySchema = z.infer<typeof depositBodySchema>;
