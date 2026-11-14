import { z } from "zod";

import { cuidSchema, rawAmountSchema } from "./index.validator";

export const strategyQuoteBodySchema = z
  .discriminatedUnion("action", [
    z
      .object({
        strategy_id: cuidSchema,
        action: z.literal("enter"),
        inputs: z
          .array(z.object({ asset: z.string().min(1), raw: rawAmountSchema }).strict())
          .optional(),
        budget_raw: rawAmountSchema.optional(),
      })
      .strict(),
    z
      .object({
        strategy_id: cuidSchema,
        action: z.literal("claim"),
      })
      .strict(),
    z
      .object({
        position_id: cuidSchema,
        action: z.enum(["exit", "claim"]),
      })
      .strict(),
  ]);

export type StrategyQuoteBodySchema = z.infer<typeof strategyQuoteBodySchema>;

export const strategyConfirmBodySchema = z
  .object({
    quote_id: cuidSchema,
    authorization_id: cuidSchema,
  })
  .strict();

export type StrategyConfirmBodySchema = z.infer<typeof strategyConfirmBodySchema>;
