import { z } from "zod";

import { cuidSchema } from "./index.validator";

const koboSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, "Invalid kobo amount")
  .transform((val) => BigInt(val))
  .refine((val) => val > 0n, "naira caps must be positive");

const versionSchema = z.string().min(1).max(64);

// One-time consent: bound to one owned persisted quote; all limits resolve from it.
const oneTimeSchema = z
  .object({
    kind: z.literal("one_time"),
    quote_kind: z.enum(["investment", "strategy"]),
    quote_id: cuidSchema,
    policy_version: versionSchema,
    disclosure_version: versionSchema,
  })
  .strict();

// Standing actions are limited to claim, reward_conversion, reinvest and
// withdrawal_sale; strategy entry always requires one-time consent.
export const STANDING_ACTIONS = ["claim", "reward_conversion", "reinvest", "withdrawal_sale"] as const;

const standingSchema = z
  .object({
    kind: z.literal("standing"),
    stock_ids: z.array(cuidSchema),
    strategy_ids: z.array(cuidSchema),
    actions: z.array(z.enum(STANDING_ACTIONS)).min(1),
    max_action_ngn: koboSchema,
    max_total_ngn: koboSchema,
    max_fee_bps: z.number().int().min(0).max(10_000),
    max_slippage_bps: z.number().int().min(0).max(100),
    expires_at: z.string().datetime({ offset: true }),
    policy_version: versionSchema,
    disclosure_version: versionSchema,
  })
  .strict()
  .superRefine((val, ctx) => {
    // Empty/wildcard asset scopes are rejected: at least one explicit ID list.
    if (val.stock_ids.length === 0 && val.strategy_ids.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "standing scope requires at least one stock_ids or strategy_ids entry",
      });
    }
  });

export const authorizationCreateBodySchema = z.union([oneTimeSchema, standingSchema]);

export type AuthorizationCreateBodySchema = z.infer<typeof authorizationCreateBodySchema>;
export type OneTimeAuthorizationBody = Extract<AuthorizationCreateBodySchema, { kind: "one_time" }>;
export type StandingAuthorizationBody = Extract<AuthorizationCreateBodySchema, { kind: "standing" }>;
