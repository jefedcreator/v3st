import { z } from "zod";

import { cuidSchema, minorAmountSchema } from "./index.validator";

export const tradeBuyValidatorSchema = z
  .object({
    stock_id: cuidSchema,
    amount_usdc: minorAmountSchema,
  })
  .strict();

export type TradeBuyValidatorSchema = z.infer<typeof tradeBuyValidatorSchema>;

export const tradeSellValidatorSchema = z
  .object({
    stock_id: cuidSchema,
    quantity: minorAmountSchema,
    min_amount_out: minorAmountSchema.optional(),
  })
  .strict();

export type TradeSellValidatorSchema = z.infer<typeof tradeSellValidatorSchema>;
