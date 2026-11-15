import { z } from "zod";

import { cuidSchema, minorAmountSchema, rawAmountSchema } from "./index.validator";

// Wire shape per the API table: enter is { strategy_id, action:'enter', inputs?
// | budget_raw }, claim is { strategy_id, action:'claim' } or { position_id,
// action:'claim' }, exit is { position_id, action:'exit' }.
export const strategyQuoteBodySchema = z
  .object({
    strategy_id: cuidSchema.optional(),
    position_id: cuidSchema.optional(),
    action: z.enum(["enter", "exit", "claim"]),
    inputs: z
      .array(z.object({ asset: z.string().min(1), raw: rawAmountSchema }).strict()).min(1).max(4)
      .optional(),
    budget_raw: rawAmountSchema.optional(),
    budget_ngn: minorAmountSchema.optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (val.action === "enter") {
      if (!val.strategy_id) issue("enter requires strategy_id");
      const choices = Number(val.inputs !== undefined) + Number(val.budget_raw !== undefined) + Number(val.budget_ngn !== undefined);
      if (choices !== 1) issue("enter requires exactly one of budget_ngn, budget_raw or inputs");
      if (val.position_id) issue("enter does not take position_id");
    } else if (val.action === "exit") {
      if (val.inputs || val.budget_raw !== undefined || val.budget_ngn !== undefined) issue("exit cannot change input amounts");
      if (!val.position_id) issue("exit requires position_id");
      if (val.strategy_id) issue("exit does not take strategy_id");
    } else {
      if (val.inputs || val.budget_raw !== undefined || val.budget_ngn !== undefined) issue("claim cannot change input amounts");
      if (val.strategy_id && val.position_id) issue("choose one strategy or position");
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
