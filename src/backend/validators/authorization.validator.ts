import { z } from "zod";

import { cuidSchema, minorAmountSchema } from "./index.validator";

export const authorizationCreateBodySchema = z
  .object({
    scope: z.enum(["investments", "strategies", "all"]),
    stock_id: cuidSchema.optional().nullable(),
    strategy_id: cuidSchema.optional().nullable(),
    max_spend_usdc: minorAmountSchema,
    duration_days: z.number().int().min(1).max(30),
    policy_version: z.string().min(1).max(64),
  })
  .strict();

export type AuthorizationCreateBodySchema = z.infer<typeof authorizationCreateBodySchema>;
