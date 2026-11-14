import { z } from "zod";

import { cuidSchema, minorAmountSchema } from "./index.validator";

export const withdrawalQuoteBodySchema = z
  .object({
    ngn_amount: minorAmountSchema,
    stock_id: cuidSchema.optional(),
  })
  .strict();

export type WithdrawalQuoteBodySchema = z.infer<typeof withdrawalQuoteBodySchema>;

export const withdrawalBodySchema = z
  .object({
    quote_id: cuidSchema,
  })
  .strict();

export type WithdrawalBodySchema = z.infer<typeof withdrawalBodySchema>;
