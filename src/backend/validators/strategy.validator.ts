import { z } from "zod";

import { cuidSchema, rawAmountSchema } from "./index.validator";

// Wire shape per the API table: enter is { strategy_id, action:'enter', inputs?
// | budget_raw }, claim is { strategy_id, action:'claim' } or { position_id,
// action:'claim' }, exit is { position_id, action:'exit' }.
export const strategyQuoteBodySchema = z
  .object({
    strategy_id: cuidSchema.optional(),
    position_id: cuidSchema.optional(),
    action: z.enum(["enter", "exit", "claim"]),
    inputs: z
      .array(z.object({ asset: z.string().min(1), raw: rawAmountSchema }).strict())
      .optional(),
    budget_raw: rawAmountSchema.optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (val.action === "enter") {
      if (!val.strategy_id) issue("enter requires strategy_id");
      if (!val.inputs && val.budget_raw === undefined) {
        issue("enter requires inputs or budget_raw");
      }
      if (val.position_id) issue("enter does not take position_id");
    } else if (val.action === "exit") {
      if (!val.position_id) issue("exit requires position_id");
      if (val.strategy_id) issue("exit does not take strategy_id");
    } else {
      if (!val.strategy_id && !val.position_id) {
        issue("claim requires strategy_id or position_id");
      }
    }
  });

export type StrategyQuoteBodySchema = z.infer<typeof strategyQuoteBodySchema>;

export const strategyConfirmBodySchema = z
  .object({
    quote_id: cuidSchema,
    authorization_id: cuidSchema,
  })
  .strict();

export type StrategyConfirmBodySchema = z.infer<typeof strategyConfirmBodySchema>;
