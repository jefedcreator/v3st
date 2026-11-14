import { z } from "zod";

import { cuidSchema, rawAmountSchema } from "./index.validator";

export const investmentQuoteBodySchema = z
  .object({
    stock_id: cuidSchema,
    side: z.enum(["buy", "sell"]),
    // Buys may size in settlement micro-units (input_raw) or naira (budget_ngn,
    // converted at the display rate); sells size in stock raw units (input_raw).
    input_raw: rawAmountSchema.optional(),
    budget_ngn: rawAmountSchema.optional(),
    slippage_bps: z.number().int().min(0).max(10_000).optional(),
    allow_partial_fill: z.boolean().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.side === "sell" && val.input_raw === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sell requires input_raw (stock raw units)" });
    }
    if (val.side === "buy" && val.input_raw === undefined && val.budget_ngn === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "buy requires input_raw or budget_ngn" });
    }
  });

export type InvestmentQuoteBodySchema = z.infer<typeof investmentQuoteBodySchema>;

export const investmentConfirmBodySchema = z
  .object({
    quote_id: cuidSchema,
    authorization_id: cuidSchema,
  })
  .strict();

export type InvestmentConfirmBodySchema = z.infer<typeof investmentConfirmBodySchema>;
