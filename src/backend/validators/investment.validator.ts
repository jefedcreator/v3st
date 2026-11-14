import { z } from "zod";

import { cuidSchema, rawAmountSchema } from "./index.validator";

export const investmentQuoteBodySchema = z
  .object({
    stock_id: cuidSchema,
    side: z.enum(["buy", "sell"]),
    input_raw: rawAmountSchema,
    budget_ngn: rawAmountSchema.optional(),
    slippage_bps: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export type InvestmentQuoteBodySchema = z.infer<typeof investmentQuoteBodySchema>;

export const investmentConfirmBodySchema = z
  .object({
    quote_id: cuidSchema,
    authorization_id: cuidSchema,
  })
  .strict();

export type InvestmentConfirmBodySchema = z.infer<typeof investmentConfirmBodySchema>;
